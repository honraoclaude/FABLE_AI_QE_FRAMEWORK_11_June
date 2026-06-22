// Product Owner / Backlog Intelligence Hub API.
// Serves the scored backlog and all derived planning views. The backlog is
// reference data (ported from the ProductOwner tool) computed on demand —
// pure functions of the dataset plus a capacity parameter.

import { Router } from 'express';
import {
  buildSprint,
  buildSummary,
  computeFairness,
  computeRoadmap,
  generateScenarios,
  scoreStories,
  type ScoredStory,
} from './engines/backlog.js';
import {
  CONFLICT_RESOLUTIONS,
  OUTCOMES,
  SAMPLE_BACKLOG,
  SPRINT_HISTORY,
  STAKEHOLDER_VOTES,
  STORY_REFINEMENTS,
} from './backlog-data.js';

function scored(): ScoredStory[] {
  return scoreStories(SAMPLE_BACKLOG, STAKEHOLDER_VOTES);
}

function capacityOf(value: unknown, fallback = 10): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(40, Math.max(1, Math.round(n))) : fallback;
}

export function buildPoRouter(): Router {
  const r = Router();

  // Scored backlog + summary + outcomes (feeds TPO view, heatmap, DoR gate, etc.)
  r.get('/backlog', (_req, res) => {
    const stories = scored();
    res.json({
      stories,
      summary: buildSummary(stories, OUTCOMES),
      outcomes: OUTCOMES,
    });
  });

  // Dependency-aware roadmap forecast (capacity in weeks per sprint)
  r.get('/roadmap', (req, res) => {
    res.json(computeRoadmap(scored(), capacityOf(req.query.capacity)));
  });

  // Manual sprint selection → capacity check + warnings
  r.post('/sprint', (req, res) => {
    const ids: string[] = Array.isArray(req.body?.selectedIds) ? req.body.selectedIds.map(String) : [];
    res.json(buildSprint(scored(), ids, capacityOf(req.body?.capacity)));
  });

  // Three auto-generated sprint scenarios (Fix First / Build First / Balanced)
  r.get('/scenarios', (req, res) => {
    res.json(generateScenarios(scored(), capacityOf(req.query.capacity)));
  });

  // Stakeholder fairness from sprint history
  r.get('/fairness', (_req, res) => {
    res.json(computeFairness(SPRINT_HISTORY));
  });

  // Story refinement / decomposition analysis
  r.get('/refinements', (_req, res) => {
    res.json(STORY_REFINEMENTS);
  });

  // Stakeholder conflict resolutions
  r.get('/conflicts', (_req, res) => {
    res.json(CONFLICT_RESOLUTIONS);
  });

  return r;
}
