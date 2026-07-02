import { describe, expect, it } from 'vitest';
import { analyzePredictions, buildSnapshot, type PoSnapshot } from '../src/po-snapshots.js';
import { buildSummary, scoreStories } from '../src/engines/backlog.js';
import { OUTCOMES, SAMPLE_BACKLOG, STAKEHOLDER_VOTES } from '../src/backlog-data.js';

const stories = scoreStories(SAMPLE_BACKLOG, STAKEHOLDER_VOTES);
const summary = buildSummary(stories, OUTCOMES);

function snapAt(iso: string, mutate?: (s: PoSnapshot) => void): PoSnapshot {
  const s = buildSnapshot(stories, summary, 'sample', 'sync');
  s.takenAt = iso;
  mutate?.(s);
  return s;
}

describe('Prediction accuracy (§15)', () => {
  it('needs at least 2 snapshots', () => {
    const r = analyzePredictions([snapAt('2026-06-01T00:00:00Z')], new Set());
    expect(r.stories).toHaveLength(0);
    expect(r.note).toMatch(/at least 2 snapshots/);
  });

  it('computes per-story health drift between first and latest snapshot', () => {
    const a = snapAt('2026-06-01T00:00:00Z');
    const b = snapAt('2026-06-15T00:00:00Z', (s) => {
      const target = s.stories.find((x) => x.id === 'FSC-009')!;
      target.health += 10; // refined between sprints
      target.status = 'Sprint Ready';
    });
    const r = analyzePredictions([a, b], new Set());
    const drift = r.stories.find((s) => s.id === 'FSC-009')!;
    expect(drift.healthDelta).toBe(10);
    expect(drift.latestStatus).toBe('Sprint Ready');
    expect(r.summary.improved).toBeGreaterThanOrEqual(1);
    expect(r.spanDays).toBe(14);
  });

  it('flags stories stuck in refinement and delivered-despite-low-health', () => {
    const a = snapAt('2026-06-01T00:00:00Z');
    const b = snapAt('2026-06-15T00:00:00Z');
    // FSC-009 starts (and stays) Needs Refinement at 67% health in the sample
    const r = analyzePredictions([a, b], new Set(['FSC-009']));
    const s9 = r.stories.find((s) => s.id === 'FSC-009')!;
    expect(s9.stuckInRefinement).toBe(true);
    expect(s9.delivered).toBe(true);
    expect(r.recalibrationHints.join(' ')).toMatch(/delivered|refinement/i);
  });
});
