// Product Owner / Backlog Intelligence Hub API.
// Serves the scored backlog and all derived planning views. The backlog is
// either the built-in sample (Financial Sales Cloud) or a backlog synced from
// Jira and stored in po_state; synced data takes precedence until reset.

import { Router } from 'express';
import type { Repo } from './db.js';
import {
  buildSprint,
  buildSummary,
  computeFairness,
  computeRoadmap,
  generateScenarios,
  scoreStories,
  type RawStory,
  type ScoredStory,
  type StakeholderVotes,
} from './engines/backlog.js';
import {
  CONFLICT_RESOLUTIONS,
  OUTCOMES,
  SAMPLE_BACKLOG,
  SPRINT_HISTORY,
  STAKEHOLDER_VOTES,
  STORY_REFINEMENTS,
  type Refinement,
} from './backlog-data.js';
import { poJiraConfigFromEnv, syncPoBacklogFromJira } from './po-jira.js';
import { buildTrends, takeSnapshot, type PoSnapshot } from './po-snapshots.js';
import { copilotAvailable, executeCopilotTool, runCopilot, type CopilotContext, type CopilotTurn } from './ai/copilot.js';

export { executeCopilotTool }; // re-export for tests

interface SyncedBacklog {
  stories: RawStory[];
  votes: Record<string, StakeholderVotes>;
  syncedAt: string;
  jql: string;
  count: number;
}

const PO_KEY = 'backlog';

export function buildPoRouter(repo: Repo): Router {
  const r = Router();

  function active(): { stories: RawStory[]; votes: Record<string, StakeholderVotes>; source: 'jira' | 'sample'; syncedAt?: string } {
    const synced = repo.getPoState<SyncedBacklog>(PO_KEY);
    if (synced && synced.stories.length > 0) {
      return { stories: synced.stories, votes: synced.votes, source: 'jira', syncedAt: synced.syncedAt };
    }
    return { stories: SAMPLE_BACKLOG, votes: STAKEHOLDER_VOTES, source: 'sample' };
  }

  function scored(): ScoredStory[] {
    const a = active();
    return scoreStories(a.stories, a.votes);
  }

  function capacityOf(value: unknown, fallback = 10): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.min(40, Math.max(1, Math.round(n))) : fallback;
  }

  function snapshotNow(trigger: 'boot' | 'sync' | 'reset' | 'manual') {
    const a = active();
    const stories = scoreStories(a.stories, a.votes);
    return takeSnapshot(repo, stories, buildSummary(stories, OUTCOMES), a.source, trigger);
  }

  function refinementsForActive(): Record<string, Refinement> {
    const a = active();
    if (a.source === 'sample') return STORY_REFINEMENTS;
    const out: Record<string, Refinement> = {};
    for (const s of a.stories) out[s.id] = deriveRefinement(s);
    return out;
  }

  function copilotContext(): CopilotContext {
    const a = active();
    return {
      stories: scoreStories(a.stories, a.votes),
      outcomes: OUTCOMES,
      refinements: refinementsForActive(),
      conflicts: a.source === 'sample' ? CONFLICT_RESOLUTIONS : [],
      sprintHistory: SPRINT_HISTORY,
      trends: buildTrends(repo.listPoSnapshots<PoSnapshot>()).points,
      source: a.source,
    };
  }

  // Boot snapshot so trend history accrues even without syncs (skipped when recent).
  snapshotNow('boot');

  // ── Jira sync ──────────────────────────────────────────────────────────
  r.get('/jira/status', (_req, res) => {
    const cfg = poJiraConfigFromEnv();
    const synced = repo.getPoState<SyncedBacklog>(PO_KEY);
    res.json({
      configured: cfg !== null,
      jql: cfg?.jql ?? null,
      source: synced ? 'jira' : 'sample',
      syncedAt: synced?.syncedAt ?? null,
      count: synced?.count ?? SAMPLE_BACKLOG.length,
      hint: cfg ? null : 'Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN (and optionally JIRA_PO_JQL) to enable sync',
    });
  });

  r.post('/jira/sync', async (_req, res) => {
    const cfg = poJiraConfigFromEnv();
    if (!cfg) {
      res.status(503).json({ error: 'Jira not configured — set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN' });
      return;
    }
    try {
      const mapped = await syncPoBacklogFromJira(cfg);
      if (mapped.stories.length === 0) {
        res.status(404).json({ error: `No issues matched the JQL: ${cfg.jql}` });
        return;
      }
      const state: SyncedBacklog = {
        stories: mapped.stories,
        votes: mapped.votes,
        syncedAt: new Date().toISOString(),
        jql: cfg.jql,
        count: mapped.stories.length,
      };
      repo.savePoState(PO_KEY, state);
      snapshotNow('sync');
      res.json({ synced: state.count, jql: cfg.jql, source: 'jira' });
    } catch (err) {
      res.status(502).json({ error: `Jira sync failed: ${(err as Error).message}` });
    }
  });

  r.post('/jira/reset', (_req, res) => {
    repo.clearPoState(PO_KEY);
    snapshotNow('reset');
    res.json({ source: 'sample', count: SAMPLE_BACKLOG.length });
  });

  // ── Sprint snapshots & trends ──────────────────────────────────────────
  r.get('/trends', (_req, res) => {
    res.json(buildTrends(repo.listPoSnapshots<PoSnapshot>()));
  });

  r.post('/snapshot', (_req, res) => {
    const snap = snapshotNow('manual');
    res.status(201).json({ takenAt: snap?.takenAt ?? null });
  });

  // ── Sprint Copilot (agentic chat over the engines) ─────────────────────
  r.post('/copilot', async (req, res) => {
    if (!copilotAvailable()) {
      res.status(503).json({
        error:
          'Sprint Copilot needs AI enabled — set ANTHROPIC_API_KEY in .env and remove QE_DISABLE_AI, then restart.',
      });
      return;
    }
    const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const turns: CopilotTurn[] = raw
      .filter((m: { role?: string; content?: string }) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim() !== '')
      .map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content }));
    if (turns.length === 0 || turns[turns.length - 1]!.role !== 'user') {
      res.status(400).json({ error: 'messages must end with a user turn' });
      return;
    }
    try {
      res.json(await runCopilot(turns.slice(-12), copilotContext()));
    } catch (err) {
      res.status(502).json({ error: `Copilot failed: ${(err as Error).message}` });
    }
  });

  // ── Backlog + derived views ────────────────────────────────────────────
  r.get('/backlog', (_req, res) => {
    const a = active();
    const stories = scoreStories(a.stories, a.votes);
    res.json({
      stories,
      summary: buildSummary(stories, OUTCOMES),
      outcomes: OUTCOMES,
      source: a.source,
      syncedAt: a.syncedAt ?? null,
    });
  });

  r.get('/roadmap', (req, res) => {
    res.json(computeRoadmap(scored(), capacityOf(req.query.capacity)));
  });

  r.post('/sprint', (req, res) => {
    const ids: string[] = Array.isArray(req.body?.selectedIds) ? req.body.selectedIds.map(String) : [];
    res.json(buildSprint(scored(), ids, capacityOf(req.body?.capacity)));
  });

  r.get('/scenarios', (req, res) => {
    res.json(generateScenarios(scored(), capacityOf(req.query.capacity)));
  });

  r.get('/fairness', (_req, res) => {
    res.json(computeFairness(SPRINT_HISTORY));
  });

  // Refinements: authored for the sample; heuristically derived for synced stories.
  r.get('/refinements', (_req, res) => {
    res.json(refinementsForActive());
  });

  // Conflict resolutions are hand-authored for the sample only.
  r.get('/conflicts', (_req, res) => {
    res.json(active().source === 'sample' ? CONFLICT_RESOLUTIONS : []);
  });

  return r;
}

/** Heuristic refinement for a Jira-synced story (no hand-authored analysis). */
function deriveRefinement(s: RawStory): Refinement {
  const shouldDecompose = s.effort >= 5;
  const missingElements: string[] = [];
  if (!/^as an?\b/i.test(s.userStory.trim())) missingElements.push('Story written in user-story format (As a… I want… so that…)');
  if (s.acCount < 3) missingElements.push('At least 3 acceptance criteria');
  if (!/\bso that\b|\bin order to\b/i.test(s.userStory)) missingElements.push('Explicit value statement (so that…)');

  const hiddenRisks: string[] = [];
  if (s.dependencies.length > 0) hiddenRisks.push(`Depends on ${s.dependencies.join(', ')} — sequencing risk`);
  if (s.confidence < 60) hiddenRisks.push('Low estimation confidence — consider a spike before committing');
  if (s.effort >= 8) hiddenRisks.push('Large effort — high chance of hidden scope');
  if (hiddenRisks.length === 0) hiddenRisks.push('No major risks detected from the Jira fields');

  return {
    shouldDecompose,
    reason: shouldDecompose
      ? `${s.effort}-week story — large enough to span multiple sprints; consider splitting into ~3-week slices.`
      : `${s.effort}-week story — sized to fit a single sprint.`,
    subStories: [],
    hiddenRisks,
    missingElements,
    refinementAdvice: shouldDecompose
      ? 'Split into independently shippable ~3-week slices and de-risk the largest unknown first.'
      : missingElements.length > 0
        ? 'Sprint-ready once the missing elements above are added to the Jira story.'
        : 'Sprint-ready.',
  };
}
