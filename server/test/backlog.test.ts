import { describe, expect, it } from 'vitest';
import {
  buildSprint,
  buildSummary,
  computeFairness,
  computeRoadmap,
  conflictIndex,
  dorStatus,
  generateScenarios,
  investHealth,
  priorityRank,
  readiness,
  riceScore,
  scoreStories,
  tensionPosition,
} from '../src/engines/backlog.js';
import { OUTCOMES, SAMPLE_BACKLOG, SPRINT_HISTORY, STAKEHOLDER_VOTES } from '../src/backlog-data.js';

const scored = scoreStories(SAMPLE_BACKLOG, STAKEHOLDER_VOTES);
const byId = (id: string) => scored.find((s) => s.id === id)!;

describe('Score formulas', () => {
  it('INVEST health = sum of 6 dims / 30 × 100', () => {
    expect(investHealth({ I: 4, N: 4, V: 5, E: 4, S: 4, T: 5 })).toBe(87); // FSC-001 = 26/30
    expect(investHealth({ I: 5, N: 5, V: 4, E: 5, S: 5, T: 5 })).toBe(97); // FSC-006 = 29/30
  });

  it('RICE = reach × impact × confidence / effort', () => {
    expect(riceScore({ reach: 800, impact: 3, confidence: 90, effort: 2 })).toBe(108000);
    expect(riceScore({ reach: 5000, impact: 3, confidence: 75, effort: 5 })).toBe(225000);
  });

  it('readiness thresholds: ≥70 Ready, ≥40 Refine, else Blocked', () => {
    expect(readiness(87)).toBe('Sprint Ready');
    expect(readiness(67)).toBe('Needs Refinement');
    expect(readiness(30)).toBe('Blocked');
  });

  it('priority rank = RICE × health/100', () => {
    expect(priorityRank(108000, 87)).toBe(93960);
  });

  it('conflict index = (max − min vote) / 4 × 100', () => {
    expect(conflictIndex({ ops: 1, leadership: 2, engineering: 2 })).toBe(25);
    expect(conflictIndex({ ops: 3, leadership: 5, engineering: 3 })).toBe(50);
    expect(conflictIndex({ ops: 3, leadership: 3, engineering: 3 })).toBe(0);
  });

  it('tension position by story type', () => {
    expect(tensionPosition('FIX')).toBe(5);
    expect(tensionPosition('COMPLY')).toBe(15);
    expect(tensionPosition('ENHANCE')).toBe(35);
    expect(tensionPosition('BUILD')).toBe(70);
  });

  it('DoR status bands', () => {
    expect(dorStatus(5)).toBe('Gate Passed');
    expect(dorStatus(4)).toBe('Nearly Ready');
    expect(dorStatus(3)).toBe('Needs Review');
    expect(dorStatus(2)).toBe('Not Ready');
  });
});

describe('Scoring pipeline over the FCA backlog', () => {
  it('scores all 12 stories and ranks them 1..12 by priority desc', () => {
    expect(scored).toHaveLength(12);
    expect(scored.map((s) => s.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1]!.priority).toBeGreaterThanOrEqual(scored[i]!.priority);
    }
  });

  it('FSC-001 is a Gate Passed, Sprint Ready story', () => {
    const s = byId('FSC-001');
    expect(s.health).toBe(87);
    expect(s.status).toBe('Sprint Ready');
    expect(s.dorStatus).toBe('Gate Passed');
  });

  it('FSC-009 (health 67) is Needs Refinement and only Nearly Ready on DoR', () => {
    const s = byId('FSC-009');
    expect(s.health).toBe(67);
    expect(s.status).toBe('Needs Refinement');
    expect(s.dorStatus).toBe('Nearly Ready'); // fails health_ready only
  });

  it('summary aggregates match the dataset', () => {
    const sum = buildSummary(scored, OUTCOMES);
    expect(sum.total).toBe(12);
    expect(sum.ready).toBe(8);
    expect(sum.refine).toBe(4);
    expect(sum.blocked).toBe(0);
    expect(sum.regulatedCount).toBe(7);
    expect(sum.avgHealth).toBe(78);
    expect(sum.topRice).toBe(225000);
    expect(sum.fixCount + sum.buildCount + sum.complyCount + sum.enhanceCount).toBe(12);
    // every outcome is covered by at least one story
    for (const o of OUTCOMES) expect(sum.outcomeCoverage[o.id]).toBeGreaterThan(0);
  });
});

describe('Roadmap forecaster', () => {
  const roadmap = computeRoadmap(scored, 10);

  it('places every story and never exceeds capacity per sprint', () => {
    const placed = roadmap.sprints.flatMap((sp) => sp.stories.map((s) => s.id));
    expect(new Set(placed).size).toBe(12);
    for (const sp of roadmap.sprints) expect(sp.effort).toBeLessThanOrEqual(sp.capacity);
  });

  it('respects dependencies — a story is never scheduled before its dependency', () => {
    const sprintOf: Record<string, number> = {};
    for (const sp of roadmap.sprints) for (const s of sp.stories) sprintOf[s.id] = sp.sprint;
    for (const story of SAMPLE_BACKLOG) {
      for (const dep of story.dependencies) {
        expect(sprintOf[story.id]!).toBeGreaterThan(sprintOf[dep]!);
      }
    }
  });

  it('produces a delivery summary', () => {
    expect(roadmap.deliverySummary).toMatch(/All 12 stories complete by Sprint \d+/);
  });
});

describe('Sprint builder', () => {
  it('accepts an in-capacity selection with no warnings', () => {
    const plan = buildSprint(scored, ['FSC-001', 'FSC-006', 'FSC-008'], 10);
    expect(plan.totalEffort).toBe(5);
    expect(plan.overCapacity).toBe(false);
    expect(plan.warnings).toHaveLength(0);
    expect(plan.outcomesCovered.length).toBe(3);
  });

  it('flags over-capacity and unmet dependencies', () => {
    const plan = buildSprint(scored, ['FSC-003', 'FSC-007'], 10);
    expect(plan.overCapacity).toBe(true);
    expect(plan.warnings.some((w) => /Over capacity/.test(w))).toBe(true);
    expect(plan.warnings.some((w) => /depends on unselected/.test(w))).toBe(true);
  });
});

describe('Scenario planner', () => {
  const scenarios = generateScenarios(scored, 10);

  it('produces Fix First, Build First and Balanced scenarios within capacity', () => {
    expect(scenarios.map((s) => s.key)).toEqual(['fix_first', 'build_first', 'balanced']);
    for (const sc of scenarios) {
      expect(sc.totalEffort).toBeLessThanOrEqual(10);
      expect(sc.stories.length).toBeGreaterThan(0);
    }
  });

  it('Fix First contains only FIX/COMPLY stories; Build First only BUILD/ENHANCE', () => {
    const fix = scenarios.find((s) => s.key === 'fix_first')!;
    const build = scenarios.find((s) => s.key === 'build_first')!;
    expect(fix.stories.every((s) => s.type === 'FIX' || s.type === 'COMPLY')).toBe(true);
    expect(build.stories.every((s) => s.type === 'BUILD' || s.type === 'ENHANCE')).toBe(true);
  });
});

describe('Stakeholder fairness', () => {
  it('computes coverage % per group and recommends the least-served', () => {
    const f = computeFairness(SPRINT_HISTORY);
    // ops appears in sprints 1,3,5 → 3/5 = 60%
    expect(f.groups.ops).toBe(60);
    // engineering appears in 2,3 → 2/5 = 40%
    expect(f.groups.engineering).toBe(40);
    expect(f.recommendation).toMatch(/prioritise/);
  });
});
