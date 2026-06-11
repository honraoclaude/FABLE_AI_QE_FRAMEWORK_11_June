// REST API wiring engines to persistence.

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { Repo } from './db.js';
import type { Defect, Risk, Story, TestCase } from './types.js';
import { dorChecklistFor, scoreDor } from './engines/dor.js';
import { assessReadiness, type ReadinessInput } from './engines/readiness.js';
import { dodChecklistFor, devSelfCertify, qeVerify } from './engines/dod.js';
import { generateScenariosTemplate } from './engines/ac.js';
import { moduleRiskScores, scoreRisk, RISK_TYPES } from './engines/risk.js';
import { computeDdi } from './engines/ddi.js';
import { buildRegressionPack } from './engines/regression.js';
import { computeScorecard, type HardBlockerInput, type SignalScores } from './engines/gonogo.js';
import { computeMetrics, type MetricsInput } from './engines/metrics.js';
import { assessInvest } from './engines/invest.js';
import { canMarkComplete, evaluateThreeAmigos } from './engines/threeAmigos.js';
import {
  assembleFramework,
  frameworkToCsv,
  generateFrameworkTemplate,
  type ProductContext,
  type RbtFramework,
} from './engines/rbt.js';
import {
  aiAvailable,
  analyseRisksWithAi,
  assessInvestWithAi,
  generateScenariosWithAi,
  identifyRbtRisksWithAi,
} from './ai/claude.js';
import { fetchJiraIssues, jiraConfigFromEnv, mapIssueToStory } from './integrations/jira.js';

export function buildRouter(repo: Repo): Router {
  const r = Router();

  r.get('/health', (_req, res) => {
    res.json({ ok: true, ai: aiAvailable() });
  });

  // ---------------- Jira sync (§16, §18 Phase 1) ----------------
  r.get('/jira/status', (_req, res) => {
    const cfg = jiraConfigFromEnv();
    res.json({
      configured: cfg !== null,
      jql: cfg?.jql ?? null,
      hint: cfg
        ? null
        : 'Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN (and optionally JIRA_JQL) to enable sync',
    });
  });

  r.post('/jira/sync', async (_req, res) => {
    const cfg = jiraConfigFromEnv();
    if (!cfg) {
      res.status(503).json({
        error: 'Jira not configured — set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN (and optionally JIRA_JQL)',
      });
      return;
    }
    try {
      const issues = await fetchJiraIssues(cfg);
      const byKey = new Map(
        repo.listStories().filter((s) => s.jiraKey).map((s) => [s.jiraKey as string, s]),
      );
      let created = 0;
      let updated = 0;
      for (const issue of issues) {
        const existing = byKey.get(issue.key);
        repo.saveStory(mapIssueToStory(issue, existing));
        existing ? updated++ : created++;
      }
      res.json({ fetched: issues.length, created, updated, jql: cfg.jql });
    } catch (err) {
      res.status(502).json({ error: `Jira sync failed: ${(err as Error).message}` });
    }
  });

  // ---------------- stories ----------------
  r.get('/stories', (_req, res) => {
    res.json(repo.listStories());
  });

  r.post('/stories', (req, res) => {
    const b = req.body ?? {};
    if (!b.title || !b.type) {
      res.status(400).json({ error: 'title and type are required' });
      return;
    }
    const now = new Date().toISOString();
    const story: Story = {
      id: randomUUID(),
      title: String(b.title),
      description: String(b.description ?? ''),
      type: b.type,
      status: 'backlog',
      module: String(b.module ?? 'general'),
      priority: b.priority ?? null,
      touches: Array.isArray(b.touches) ? b.touches : [],
      edgeCases: Array.isArray(b.edgeCases) ? b.edgeCases : [],
      dorChecks: {},
      dodChecks: {},
      dodVerified: {},
      createdAt: now,
      updatedAt: now,
    };
    repo.saveStory(story);
    res.status(201).json(story);
  });

  r.get('/stories/:id', (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    res.json({ story, scenarios: repo.scenariosFor(story.id) });
  });

  // ---------------- DoR (§2) ----------------
  r.get('/stories/:id/dor', (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    res.json({
      checklist: dorChecklistFor(story.type),
      checks: story.dorChecks,
      result: scoreDor(story.type, story.dorChecks),
    });
  });

  r.post('/stories/:id/dor', (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    story.dorChecks = { ...story.dorChecks, ...(req.body?.checks ?? {}) };
    const result = scoreDor(story.type, story.dorChecks);
    story.status =
      result.status === 'ready'
        ? 'ready_for_3_amigos'
        : result.status === 'conditionally_ready'
          ? 'in_readiness_review'
          : 'actions_pending';
    story.updatedAt = new Date().toISOString();
    repo.saveStory(story);
    res.json({ result, story });
  });

  // ---------------- INVEST assessment ----------------
  r.post('/stories/:id/invest', async (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    const scenarios = repo.scenariosFor(story.id);
    const assessment =
      (await assessInvestWithAi(story, scenarios)) ?? assessInvest(story, scenarios);
    res.json(assessment);
  });

  // ---------------- 3 Amigos evaluator (§3) ----------------
  r.post('/stories/:id/three-amigos/evaluate', async (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    const scenarios = repo.scenariosFor(story.id);
    const invest = (await assessInvestWithAi(story, scenarios)) ?? assessInvest(story, scenarios);
    const evaluation = evaluateThreeAmigos(story, invest);
    story.actions = evaluation.actions;
    story.updatedAt = new Date().toISOString();
    repo.saveStory(story);
    res.json(evaluation);
  });

  r.post('/stories/:id/actions/:actionId/toggle', (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    const action = (story.actions ?? []).find((a) => a.id === req.params.actionId);
    if (!action) {
      res.status(404).json({ error: 'action not found — run the evaluator first' });
      return;
    }
    action.done = !action.done;
    story.updatedAt = new Date().toISOString();
    repo.saveStory(story);
    res.json({ action, openActions: (story.actions ?? []).filter((a) => !a.done).length });
  });

  r.post('/stories/:id/three-amigos/complete', (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    if (!story.actions) {
      res.status(409).json({ error: 'Run the 3 Amigos evaluator before marking complete' });
      return;
    }
    const gate = canMarkComplete(story);
    if (!gate.allowed) {
      res.status(409).json({ error: gate.reason });
      return;
    }
    story.status = 'three_amigos_complete';
    story.updatedAt = new Date().toISOString();
    repo.saveStory(story);
    res.json({ story, message: '3 Amigos complete — next: AC generation and QA approval' });
  });

  r.post('/stories/:id/three-amigos/reopen', (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    if (story.status !== 'three_amigos_complete') {
      res.status(409).json({
        error: `Only stories in three_amigos_complete can be reopened (current: ${story.status})`,
      });
      return;
    }
    story.status = 'in_readiness_review';
    story.updatedAt = new Date().toISOString();
    repo.saveStory(story);
    res.json({ story, message: 'Reopened — story is back in readiness review' });
  });

  // ---------------- 3 Amigos readiness (§3) ----------------
  r.post('/stories/:id/readiness', (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    const input: ReadinessInput = {
      acWrittenSpecificTestable: Boolean(req.body?.acWrittenSpecificTestable),
      wireframesLinked: Boolean(req.body?.wireframesLinked),
      technicalApproachLinked: Boolean(req.body?.technicalApproachLinked),
      prioritySetAndWhyClear: Boolean(req.body?.prioritySetAndWhyClear),
      edgeCaseCount: Number(req.body?.edgeCaseCount ?? story.edgeCases.length),
      dependenciesLinkedOrNone: Boolean(req.body?.dependenciesLinkedOrNone),
    };
    const result = assessReadiness(input);
    if (result.ready) {
      story.status = 'three_amigos_complete';
      story.updatedAt = new Date().toISOString();
      repo.saveStory(story);
    }
    res.json({ result, story });
  });

  // ---------------- AC generation (§5) ----------------
  r.post('/stories/:id/ac/generate', async (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    const scenarios = (await generateScenariosWithAi(story)) ?? generateScenariosTemplate(story);
    repo.deleteScenariosFor(story.id);
    for (const s of scenarios) repo.saveScenario(s);
    story.status = 'ac_draft_in_review';
    story.updatedAt = new Date().toISOString();
    repo.saveStory(story);
    res.json({ source: scenarios[0]?.source ?? 'template', scenarios });
  });

  r.post('/stories/:id/ac/approve', (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    const scenarios = repo.scenariosFor(story.id).map((s) => ({ ...s, approved: true }));
    for (const s of scenarios) repo.saveScenario(s);
    story.status = 'ready_for_dev';
    story.updatedAt = new Date().toISOString();
    repo.saveStory(story);
    res.json({ story, scenarios });
  });

  // ---------------- DoD dual verification (§4) ----------------
  r.get('/stories/:id/dod', (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    res.json({ checklist: dodChecklistFor(story.type), checks: story.dodChecks, verified: story.dodVerified });
  });

  r.post('/stories/:id/dod/self-certify', (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    story.dodChecks = { ...story.dodChecks, ...(req.body?.checks ?? {}) };
    const result = devSelfCertify(story.type, story.dodChecks);
    story.status = result.complete ? 'qe_verification' : 'dev_self_certification';
    story.updatedAt = new Date().toISOString();
    repo.saveStory(story);
    res.json({ result, story });
  });

  r.post('/stories/:id/dod/qe-verify', (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    if (!devSelfCertify(story.type, story.dodChecks).complete) {
      res.status(409).json({ error: 'Dev self-certification incomplete — QE verification not yet allowed' });
      return;
    }
    story.dodVerified = { ...story.dodVerified, ...(req.body?.verified ?? {}) };
    const result = qeVerify(story.type, story.dodVerified);
    story.status = result.passed ? 'ready_for_release' : 'qe_verification';
    story.updatedAt = new Date().toISOString();
    repo.saveStory(story);
    res.json({ result, story });
  });

  // ---------------- Risk register (§6) ----------------
  r.get('/risks', (_req, res) => {
    res.json({ types: RISK_TYPES, risks: repo.listRisks() });
  });

  r.post('/risks', (req, res) => {
    const b = req.body ?? {};
    let scored;
    try {
      scored = scoreRisk(Number(b.severity), Number(b.likelihood));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    const risk: Risk = {
      id: randomUUID(),
      type: b.type ?? 'coverage_gap',
      module: String(b.module ?? 'general'),
      description: String(b.description ?? ''),
      severity: Number(b.severity),
      likelihood: Number(b.likelihood),
      ...scored,
      mitigation: b.mitigation ?? null,
      source: 'qe_manual',
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    repo.saveRisk(risk);
    res.status(201).json(risk);
  });

  r.post('/stories/:id/risks/analyse', async (req, res) => {
    const story = repo.getStory(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'story not found' });
      return;
    }
    const risks = await analyseRisksWithAi(story);
    if (!risks) {
      res.status(503).json({
        error: 'AI risk analysis unavailable (no ANTHROPIC_API_KEY) — add risks manually via POST /api/risks',
      });
      return;
    }
    for (const risk of risks) repo.saveRisk(risk);
    res.json({ risks });
  });

  // ---------------- Defects + DDI (§7.2) ----------------
  r.post('/defects', (req, res) => {
    const b = req.body ?? {};
    const defect: Defect = {
      id: randomUUID(),
      module: String(b.module ?? 'general'),
      severity: b.severity ?? 'medium',
      title: String(b.title ?? ''),
      foundIn: b.foundIn ?? 'testing',
      status: b.status ?? 'open',
      createdAt: new Date().toISOString(),
    };
    repo.saveDefect(defect);
    res.status(201).json(defect);
  });

  r.get('/defects', (_req, res) => {
    res.json(repo.listDefects());
  });

  r.get('/ddi', (req, res) => {
    const module = req.query.module ? String(req.query.module) : null;
    const defects = repo.listDefects().filter((d) => !module || d.module === module);
    const storiesDelivered = repo
      .listStories()
      .filter((s) => s.status === 'released' && (!module || s.module === module)).length;
    res.json({ module: module ?? 'all', ...computeDdi(defects, storiesDelivered) });
  });

  // ---------------- Regression pack (§7) ----------------
  r.get('/tests', (_req, res) => {
    res.json(repo.listTests());
  });

  r.post('/tests', (req, res) => {
    const b = req.body ?? {};
    const test: TestCase = {
      id: randomUUID(),
      name: String(b.name ?? 'unnamed test'),
      module: String(b.module ?? 'general'),
      smoke: Boolean(b.smoke),
      tags: Array.isArray(b.tags) ? b.tags : [],
      automated: Boolean(b.automated),
      history: {
        failedInLastRelease: Boolean(b.history?.failedInLastRelease),
        lastFailedReleasesAgo: b.history?.lastFailedReleasesAgo ?? null,
        flaky: Boolean(b.history?.flaky),
        fixedButHighRiskArea: Boolean(b.history?.fixedButHighRiskArea),
        sprintsSinceLastFailure: b.history?.sprintsSinceLastFailure ?? null,
      },
    };
    repo.saveTest(test);
    res.status(201).json(test);
  });

  r.post('/regression/build', (req, res) => {
    const changedModules: string[] = Array.isArray(req.body?.changedModules) ? req.body.changedModules : [];
    const releaseKind = req.body?.releaseKind === 'major' ? 'major' : 'standard';

    const tests = repo.listTests();
    const riskScores = moduleRiskScores(repo.listRisks());
    const defects = repo.listDefects();
    const stories = repo.listStories();

    const moduleDdiBands: Record<string, 'high' | 'medium' | 'low'> = {};
    for (const m of new Set(tests.map((t) => t.module))) {
      const released = stories.filter((s) => s.status === 'released' && s.module === m).length;
      moduleDdiBands[m] = computeDdi(defects.filter((d) => d.module === m), released).band;
    }

    const pack = buildRegressionPack({
      tests,
      moduleRiskScores: riskScores,
      moduleDdiBands,
      changedModules,
      releaseKind,
    });
    res.json(pack);
  });

  // ---------------- Go/No-Go (§8) ----------------
  r.post('/gonogo', (req, res) => {
    const blockers: HardBlockerInput = {
      criticalBugsOpen: Number(req.body?.blockers?.criticalBugsOpen ?? 0),
      p1SmokeAllPassing: Boolean(req.body?.blockers?.p1SmokeAllPassing),
      poSignOffReceived: Boolean(req.body?.blockers?.poSignOffReceived),
    };
    const s = req.body?.signals ?? {};
    const signals: SignalScores = {
      p1SmokeTests: Number(s.p1SmokeTests ?? 0),
      p2RiskBasedTests: Number(s.p2RiskBasedTests ?? 0),
      dodCompliance: Number(s.dodCompliance ?? 0),
      riskRegisterStatus: Number(s.riskRegisterStatus ?? 0),
      acCoverage: Number(s.acCoverage ?? 0),
      defectDensity: Number(s.defectDensity ?? 0),
      securityScan: Number(s.securityScan ?? 0),
      performanceBudget: Number(s.performanceBudget ?? 0),
    };
    res.json(computeScorecard(blockers, signals));
  });

  // ---------------- Risk-Based Testing framework ----------------
  r.post('/rbt/generate', async (req, res) => {
    const b = req.body ?? {};
    const ctx: ProductContext = {
      productName: String(b.productName ?? ''),
      industry: String(b.industry ?? ''),
      applicationType: String(b.applicationType ?? ''),
      businessProcesses: Array.isArray(b.businessProcesses) ? b.businessProcesses.map(String) : [],
      architecture: String(b.architecture ?? ''),
      integrations: Array.isArray(b.integrations) ? b.integrations.map(String) : [],
      userBase: String(b.userBase ?? ''),
      geographies: String(b.geographies ?? ''),
      regulations: Array.isArray(b.regulations) ? b.regulations.map(String) : [],
    };
    if (!ctx.productName || ctx.businessProcesses.length === 0) {
      res.status(400).json({ error: 'productName and at least one business process are required' });
      return;
    }
    const id = randomUUID();
    const ai = await identifyRbtRisksWithAi(ctx);
    const framework = ai
      ? assembleFramework(id, ctx, ai.risks, ai.executiveSummary, 'ai')
      : generateFrameworkTemplate(id, ctx);
    repo.saveRbtFramework(framework);
    res.status(201).json(framework);
  });

  r.get('/rbt', (_req, res) => {
    const all = repo.listRbtFrameworks<RbtFramework>();
    res.json(
      all
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((f) => ({
          id: f.id,
          createdAt: f.createdAt,
          productName: f.context.productName,
          riskCount: f.risks.length,
          source: f.source,
        })),
    );
  });

  r.get('/rbt/:id', (req, res) => {
    const fw = repo.getRbtFramework<RbtFramework>(req.params.id);
    if (!fw) {
      res.status(404).json({ error: 'framework not found' });
      return;
    }
    res.json(fw);
  });

  r.get('/rbt/:id/export.csv', (req, res) => {
    const fw = repo.getRbtFramework<RbtFramework>(req.params.id);
    if (!fw) {
      res.status(404).json({ error: 'framework not found' });
      return;
    }
    res
      .type('text/csv')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="risk-register-${fw.context.productName.replaceAll(/[^\w-]+/g, '-') || 'product'}.csv"`,
      )
      .send(frameworkToCsv(fw));
  });

  // ---------------- Metrics (§14) ----------------
  r.post('/metrics', (req, res) => {
    const b = req.body ?? {};
    const input: MetricsInput = {
      prodBugs: Number(b.prodBugs ?? 0),
      totalBugs: Number(b.totalBugs ?? 0),
      bugsCaughtBeforeDev: Number(b.bugsCaughtBeforeDev ?? 0),
      automatedTests: Number(b.automatedTests ?? 0),
      totalTests: Number(b.totalTests ?? 0),
      avgSprintsToDetect: Number(b.avgSprintsToDetect ?? 0),
      storiesMeetingFullDod: Number(b.storiesMeetingFullDod ?? 0),
      storiesDelivered: Number(b.storiesDelivered ?? 0),
      flakyTests: Number(b.flakyTests ?? 0),
      autoTestsThatCaughtBug: Number(b.autoTestsThatCaughtBug ?? 0),
    };
    res.json(computeMetrics(input));
  });

  /** Live metrics derived from portal data where derivable. */
  r.get('/metrics', (_req, res) => {
    const defects = repo.listDefects();
    const stories = repo.listStories();
    const tests = repo.listTests();
    const released = stories.filter((s) => s.status === 'released');
    res.json(
      computeMetrics({
        prodBugs: defects.filter((d) => d.foundIn === 'production').length,
        totalBugs: defects.length,
        bugsCaughtBeforeDev: defects.filter((d) => d.foundIn === 'requirements' || d.foundIn === 'design').length,
        automatedTests: tests.filter((t) => t.automated).length,
        totalTests: tests.length,
        avgSprintsToDetect: 0,
        storiesMeetingFullDod: released.length,
        storiesDelivered: released.length,
        flakyTests: tests.filter((t) => t.history.flaky).length,
        autoTestsThatCaughtBug: 0,
      }),
    );
  });

  return r;
}
