// Backlog Intelligence Hub engine — ported from the Python ProductOwner tool.
// Pure scoring + planning functions for Product Owner backlog management:
// INVEST health, RICE prioritisation, sprint readiness, DoR gate, stakeholder
// conflict, tension positioning, roadmap forecasting, scenario planning, and
// stakeholder fairness.

export type StoryType = 'FIX' | 'BUILD' | 'COMPLY' | 'ENHANCE';

export interface RawStory {
  id: string;
  epic: string;
  title: string;
  userStory: string;
  businessValue: string;
  stakeholderOutcome: string;
  invest: { I: number; N: number; V: number; E: number; S: number; T: number };
  reach: number;
  impact: number;
  confidence: number;
  effort: number; // weeks
  regulated: boolean; // touches FCA-regulated data/process (suitability, PII, audit)
  acCount: number;
  dependencies: string[];
  storyType: StoryType;
  outcome: string; // outcome id (mttr/uptime/field/compliance/csat)
}

export interface StakeholderVotes {
  ops: number; // 1=strongly Fix … 5=strongly Build
  leadership: number;
  engineering: number;
}

export type Readiness = 'Sprint Ready' | 'Needs Refinement' | 'Blocked';
export type DorStatus = 'Gate Passed' | 'Nearly Ready' | 'Needs Review' | 'Not Ready';

export interface ScoredStory extends RawStory {
  health: number; // INVEST 0–100
  riceScore: number;
  status: Readiness;
  statusColor: string;
  priority: number; // priority rank = rice × health/100
  rank: number; // 1-based after sorting by priority desc
  dorChecks: Record<string, boolean>;
  dorScore: number;
  dorStatus: DorStatus;
  dorColor: string;
  typeColor: string;
  votes: StakeholderVotes;
  conflictIdx: number;
  tensionPos: number;
}

// ── Strategic constants (parity with the Python tool) ──────────────────────

export const TYPE_COLORS: Record<StoryType, string> = {
  FIX: '#1F3864',
  BUILD: '#1E6B4A',
  COMPLY: '#B5520F', // darkened from #C55A11 to meet WCAG AA 4.5:1 as small text
  ENHANCE: '#5C277F',
};

export interface Outcome {
  id: string;
  label: string;
  color: string;
  target: string;
  current: string;
  unit: string;
}

// ── Score engine ───────────────────────────────────────────────────────────

/** INVEST health: sum of 6 dimensions (1–5 each) / 30 × 100. */
export function investHealth(invest: RawStory['invest']): number {
  const sum = invest.I + invest.N + invest.V + invest.E + invest.S + invest.T;
  return Math.round((sum / 30) * 100);
}

/** RICE = (reach × impact × confidence) ÷ effort. */
export function riceScore(s: Pick<RawStory, 'reach' | 'impact' | 'confidence' | 'effort'>): number {
  return Math.round((s.reach * s.impact * s.confidence) / s.effort);
}

export function readiness(health: number): Readiness {
  if (health >= 70) return 'Sprint Ready';
  if (health >= 40) return 'Needs Refinement';
  return 'Blocked';
}

export function readinessColor(status: Readiness): string {
  return { 'Sprint Ready': '#1E6B4A', 'Needs Refinement': '#C55A11', Blocked: '#8B1A1A' }[status];
}

/** Priority rank = RICE weighted by story health. */
export function priorityRank(rice: number, health: number): number {
  return Math.round(rice * (health / 100));
}

/** Conflict index: spread between the most- and least-supportive stakeholder. */
export function conflictIndex(votes: StakeholderVotes): number {
  const vals = [votes.ops, votes.leadership, votes.engineering];
  return Math.round(((Math.max(...vals) - Math.min(...vals)) / 4) * 100);
}

/** Tension axis position (Fix ↔ Build) by story type. */
export function tensionPosition(storyType: StoryType): number {
  return { FIX: 5, ENHANCE: 35, BUILD: 70, COMPLY: 15 }[storyType] ?? 50;
}

// ── DoR engine ─────────────────────────────────────────────────────────────

export function dorChecks(s: { userStory: string; acCount: number; health: number }): Record<string, boolean> {
  return {
    has_user_story: s.userStory.trim().toLowerCase().startsWith('as a'),
    has_3_ac: s.acCount >= 3,
    compliance_assessed: true,
    health_ready: s.health >= 70,
    dependencies_clear: true,
  };
}

export function dorScore(checks: Record<string, boolean>): number {
  return Object.values(checks).filter(Boolean).length;
}

export function dorStatus(score: number): DorStatus {
  if (score === 5) return 'Gate Passed';
  if (score === 4) return 'Nearly Ready';
  if (score === 3) return 'Needs Review';
  return 'Not Ready';
}

export function dorColor(status: DorStatus): string {
  return {
    'Gate Passed': '#1E6B4A',
    'Nearly Ready': '#00709B',
    'Needs Review': '#C55A11',
    'Not Ready': '#8B1A1A',
  }[status];
}

// ── Scoring pipeline ───────────────────────────────────────────────────────

export function scoreStories(
  raw: RawStory[],
  votesById: Record<string, StakeholderVotes>,
): ScoredStory[] {
  const scored: ScoredStory[] = raw.map((r) => {
    const health = investHealth(r.invest);
    const rice = riceScore(r);
    const status = readiness(health);
    const checks = dorChecks({ userStory: r.userStory, acCount: r.acCount, health });
    const ds = dorScore(checks);
    const dStatus = dorStatus(ds);
    const votes = votesById[r.id] ?? { ops: 3, leadership: 3, engineering: 3 };
    return {
      ...r,
      health,
      riceScore: rice,
      status,
      statusColor: readinessColor(status),
      priority: priorityRank(rice, health),
      rank: 0,
      dorChecks: checks,
      dorScore: ds,
      dorStatus: dStatus,
      dorColor: dorColor(dStatus),
      typeColor: TYPE_COLORS[r.storyType] ?? '#888',
      votes,
      conflictIdx: conflictIndex(votes),
      tensionPos: tensionPosition(r.storyType),
    };
  });
  scored.sort((a, b) => b.priority - a.priority);
  scored.forEach((s, i) => (s.rank = i + 1));
  return scored;
}

// ── Roadmap forecaster (dependency-aware sprint assignment) ─────────────────

export interface RoadmapSprint {
  sprint: number;
  effort: number;
  capacity: number;
  stories: { id: string; title: string; effort: number; color: string; status: Readiness; epic: string; outcome: string; rank: number; rice: number; health: number }[];
}

export interface Roadmap {
  sprints: RoadmapSprint[];
  outcomeSprints: Record<string, number>;
  deliverySummary: string;
}

export function computeRoadmap(stories: ScoredStory[], capacity = 10): Roadmap {
  const storyMap = new Map(stories.map((s) => [s.id, s]));
  const assigned = new Map<string, number>();
  const sprintEffort = new Map<number, number>();
  const processed = new Set<string>();

  for (let iter = 0; iter < stories.length * 3; iter++) {
    if (processed.size === stories.length) break;
    for (const s of [...stories].sort((a, b) => a.rank - b.rank)) {
      if (processed.has(s.id)) continue;
      // All in-backlog dependencies must already be placed.
      if (!s.dependencies.every((d) => processed.has(d) || !storyMap.has(d))) continue;
      const depSprints = s.dependencies.filter((d) => assigned.has(d)).map((d) => assigned.get(d)! + 1);
      let sp = depSprints.length ? Math.max(...depSprints) : 1;
      while ((sprintEffort.get(sp) ?? 0) + s.effort > capacity) sp++;
      sprintEffort.set(sp, (sprintEffort.get(sp) ?? 0) + s.effort);
      assigned.set(s.id, sp);
      processed.add(s.id);
    }
  }
  // Any story left unplaced (dependency cycle) goes to a trailing sprint.
  for (const s of stories) {
    if (!assigned.has(s.id)) {
      const sp = Math.max(0, ...assigned.values()) + 1;
      sprintEffort.set(sp, (sprintEffort.get(sp) ?? 0) + s.effort);
      assigned.set(s.id, sp);
    }
  }

  const numSprints = Math.max(1, ...assigned.values());
  const sprints: RoadmapSprint[] = [];
  for (let n = 1; n <= numSprints; n++) {
    const inSprint = stories.filter((s) => assigned.get(s.id) === n).sort((a, b) => a.rank - b.rank);
    sprints.push({
      sprint: n,
      effort: sprintEffort.get(n) ?? 0,
      capacity,
      stories: inSprint.map((s) => ({
        id: s.id, title: s.title, effort: s.effort, color: s.statusColor,
        status: s.status, epic: s.epic, outcome: s.outcome, rank: s.rank, rice: s.riceScore, health: s.health,
      })),
    });
  }

  const outcomeSprints: Record<string, number> = {};
  for (const oid of ['mttr', 'uptime', 'field', 'compliance', 'csat']) {
    const ids = stories.filter((s) => s.outcome === oid).map((s) => assigned.get(s.id) ?? 1);
    if (ids.length) outcomeSprints[oid] = Math.max(...ids);
  }
  const deliverySummary = `All ${stories.length} stories complete by Sprint ${numSprints} (~${numSprints * capacity} weeks at ${capacity}-week capacity)`;
  return { sprints, outcomeSprints, deliverySummary };
}

// ── Sprint builder (capacity check for a manual selection) ──────────────────

export interface SprintPlan {
  selected: { id: string; title: string; effort: number; status: Readiness; health: number }[];
  totalEffort: number;
  capacity: number;
  overCapacity: boolean;
  warnings: string[];
  outcomesCovered: string[];
  avgHealth: number;
}

export function buildSprint(stories: ScoredStory[], selectedIds: string[], capacity = 10): SprintPlan {
  const selected = stories.filter((s) => selectedIds.includes(s.id));
  const totalEffort = selected.reduce((sum, s) => sum + s.effort, 0);
  const warnings: string[] = [];
  if (totalEffort > capacity) {
    warnings.push(`Over capacity: ${totalEffort} of ${capacity} weeks selected — remove ${totalEffort - capacity} weeks of work`);
  }
  const blocked = selected.filter((s) => s.status === 'Blocked');
  if (blocked.length) warnings.push(`${blocked.length} blocked story(ies) selected: ${blocked.map((s) => s.id).join(', ')}`);
  // Dependencies not in the selection.
  for (const s of selected) {
    const missing = s.dependencies.filter((d) => stories.some((x) => x.id === d) && !selectedIds.includes(d));
    if (missing.length) warnings.push(`${s.id} depends on unselected: ${missing.join(', ')}`);
  }
  const outcomesCovered = [...new Set(selected.map((s) => s.outcome))];
  const avgHealth = selected.length ? Math.round(selected.reduce((sum, s) => sum + s.health, 0) / selected.length) : 0;
  return {
    selected: selected.map((s) => ({ id: s.id, title: s.title, effort: s.effort, status: s.status, health: s.health })),
    totalEffort,
    capacity,
    overCapacity: totalEffort > capacity,
    warnings,
    outcomesCovered,
    avgHealth,
  };
}

// ── Scenario planner (3 auto-generated sprint scenarios) ────────────────────

export interface Scenario {
  key: 'fix_first' | 'build_first' | 'balanced';
  label: string;
  description: string;
  stories: { id: string; title: string; effort: number; type: StoryType }[];
  totalEffort: number;
  avgHealth: number;
  avgConflict: number;
  outcomesCovered: string[];
}

function fillToCapacity(pool: ScoredStory[], capacity: number): ScoredStory[] {
  const chosen: ScoredStory[] = [];
  let effort = 0;
  for (const s of pool) {
    if (effort + s.effort <= capacity) {
      chosen.push(s);
      effort += s.effort;
    }
  }
  return chosen;
}

function summariseScenario(
  key: Scenario['key'],
  label: string,
  description: string,
  chosen: ScoredStory[],
): Scenario {
  return {
    key,
    label,
    description,
    stories: chosen.map((s) => ({ id: s.id, title: s.title, effort: s.effort, type: s.storyType })),
    totalEffort: chosen.reduce((sum, s) => sum + s.effort, 0),
    avgHealth: chosen.length ? Math.round(chosen.reduce((sum, s) => sum + s.health, 0) / chosen.length) : 0,
    avgConflict: chosen.length ? Math.round(chosen.reduce((sum, s) => sum + s.conflictIdx, 0) / chosen.length) : 0,
    outcomesCovered: [...new Set(chosen.map((s) => s.outcome))],
  };
}

export function generateScenarios(stories: ScoredStory[], capacity = 10): Scenario[] {
  const ready = stories.filter((s) => s.status !== 'Blocked');
  const byPriority = [...ready].sort((a, b) => b.priority - a.priority);

  const fixPool = byPriority.filter((s) => s.storyType === 'FIX' || s.storyType === 'COMPLY');
  const buildPool = byPriority.filter((s) => s.storyType === 'BUILD' || s.storyType === 'ENHANCE');

  return [
    summariseScenario('fix_first', 'Fix First', 'Reliability and compliance before new capability — addresses operational risk first.', fillToCapacity(fixPool, capacity)),
    summariseScenario('build_first', 'Build First', 'New capability and growth features prioritised for market and revenue impact.', fillToCapacity(buildPool, capacity)),
    summariseScenario('balanced', 'Balanced', 'Highest priority-rank stories regardless of type — pure RICE × health ordering.', fillToCapacity(byPriority, capacity)),
  ];
}

// ── Stakeholder fairness ────────────────────────────────────────────────────

export interface Fairness {
  groups: Record<string, number>; // % of last N sprints that addressed each group
  history: Record<string, string[]>;
  recommendation: string;
}

export function computeFairness(sprintHistory: Record<number, string[]>): Fairness {
  const groups = ['ops', 'leadership', 'engineering', 'compliance'];
  const sprints = Object.values(sprintHistory);
  const pct: Record<string, number> = {};
  for (const g of groups) {
    pct[g] = Math.round((sprints.filter((sp) => sp.includes(g)).length / sprints.length) * 100);
  }
  const leastServed = groups.reduce((min, g) => (pct[g]! < pct[min]! ? g : min), groups[0]!);
  return {
    groups: pct,
    history: Object.fromEntries(Object.entries(sprintHistory).map(([k, v]) => [String(k), v])),
    recommendation: `${leastServed} has been addressed least (${pct[leastServed]}% of recent sprints) — prioritise a ${leastServed}-aligned story next sprint to rebalance.`,
  };
}

// ── Summary ─────────────────────────────────────────────────────────────────

export interface BacklogSummary {
  total: number;
  ready: number;
  refine: number;
  blocked: number;
  regulatedCount: number;
  avgHealth: number;
  topRice: number;
  dorReady: number;
  fixCount: number;
  buildCount: number;
  complyCount: number;
  enhanceCount: number;
  avgConflict: number;
  outcomeCoverage: Record<string, number>;
}

export function buildSummary(stories: ScoredStory[], outcomes: Outcome[]): BacklogSummary {
  const count = (fn: (s: ScoredStory) => boolean) => stories.filter(fn).length;
  return {
    total: stories.length,
    ready: count((s) => s.status === 'Sprint Ready'),
    refine: count((s) => s.status === 'Needs Refinement'),
    blocked: count((s) => s.status === 'Blocked'),
    regulatedCount: count((s) => s.regulated),
    avgHealth: Math.round(stories.reduce((sum, s) => sum + s.health, 0) / stories.length),
    topRice: Math.max(...stories.map((s) => s.riceScore)),
    dorReady: count((s) => s.dorScore >= 4),
    fixCount: count((s) => s.storyType === 'FIX'),
    buildCount: count((s) => s.storyType === 'BUILD'),
    complyCount: count((s) => s.storyType === 'COMPLY'),
    enhanceCount: count((s) => s.storyType === 'ENHANCE'),
    avgConflict: Math.round(stories.reduce((sum, s) => sum + s.conflictIdx, 0) / stories.length),
    outcomeCoverage: Object.fromEntries(outcomes.map((o) => [o.id, count((s) => s.outcome === o.id)])),
  };
}
