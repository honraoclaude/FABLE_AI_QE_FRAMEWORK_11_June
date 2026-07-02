// Sprint Copilot tool executor — the deterministic layer Claude calls.
// These tests run without any API access.

import { describe, expect, it } from 'vitest';
import { executeCopilotTool, COPILOT_TOOLS, type CopilotContext } from '../src/ai/copilot.js';
import { buildSummary, scoreStories } from '../src/engines/backlog.js';
import {
  CONFLICT_RESOLUTIONS,
  OUTCOMES,
  SAMPLE_BACKLOG,
  SPRINT_HISTORY,
  STAKEHOLDER_VOTES,
  STORY_REFINEMENTS,
} from '../src/backlog-data.js';

const stories = scoreStories(SAMPLE_BACKLOG, STAKEHOLDER_VOTES);
const ctx: CopilotContext = {
  stories,
  outcomes: OUTCOMES,
  refinements: STORY_REFINEMENTS,
  conflicts: CONFLICT_RESOLUTIONS,
  sprintHistory: SPRINT_HISTORY,
  trends: [],
  source: 'sample',
};

describe('Sprint Copilot tool executor', () => {
  it('defines 7 tools, all with object input schemas', () => {
    expect(COPILOT_TOOLS).toHaveLength(7);
    for (const t of COPILOT_TOOLS) expect(t.input_schema.type).toBe('object');
  });

  it('get_backlog_overview returns summary + ranked condensed stories', () => {
    const r = executeCopilotTool('get_backlog_overview', {}, ctx) as {
      summary: { total: number }; stories: { id: string; rank: number }[];
    };
    expect(r.summary.total).toBe(12);
    expect(r.stories[0]?.rank).toBe(1);
    expect(r.stories.map((s) => s.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('get_story_details explains the priority formula and includes refinement + conflict data', () => {
    const r = executeCopilotTool('get_story_details', { story_id: 'fsc-003' }, ctx) as {
      priorityFormula: string; refinement: { shouldDecompose: boolean }; conflictResolution: { storyId: string };
    };
    expect(r.priorityFormula).toMatch(/RICE \d+ × \(health \d+\/100\)/);
    expect(r.refinement.shouldDecompose).toBe(true);
    expect(r.conflictResolution.storyId).toBe('FSC-003');
  });

  it('get_story_details returns a helpful error for unknown ids', () => {
    const r = executeCopilotTool('get_story_details', { story_id: 'NOPE-1' }, ctx) as { error: string };
    expect(r.error).toMatch(/Valid ids:/);
    expect(r.error).toContain('FSC-001');
  });

  it('build_sprint_plan flags over-capacity selections', () => {
    const r = executeCopilotTool(
      'build_sprint_plan',
      { story_ids: ['FSC-003', 'FSC-007'], capacity_weeks: 10 },
      ctx,
    ) as { overCapacity: boolean; warnings: string[] };
    expect(r.overCapacity).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('forecast_roadmap responds to capacity changes', () => {
    const at10 = executeCopilotTool('forecast_roadmap', { capacity_weeks: 10 }, ctx) as { sprints: unknown[] };
    const at5 = executeCopilotTool('forecast_roadmap', { capacity_weeks: 5 }, ctx) as { sprints: unknown[] };
    expect(at5.sprints.length).toBeGreaterThan(at10.sprints.length);
  });

  it('generate_sprint_scenarios honours the capacity argument (e.g. 8 weeks)', () => {
    const r = executeCopilotTool('generate_sprint_scenarios', { capacity_weeks: 8 }, ctx) as { totalEffort: number }[];
    expect(r).toHaveLength(3);
    for (const sc of r) expect(sc.totalEffort).toBeLessThanOrEqual(8);
  });

  it('get_trends notes when history is too short', () => {
    const r = executeCopilotTool('get_trends', {}, ctx) as { note?: string };
    expect(r.note).toMatch(/Fewer than 2 snapshots/);
  });

  it('unknown tools return an error object rather than throwing', () => {
    const r = executeCopilotTool('does_not_exist', {}, ctx) as { error: string };
    expect(r.error).toMatch(/Unknown tool/);
  });
});
