import { describe, expect, it } from 'vitest';
import { buildSnapshot, buildTrends, type PoSnapshot } from '../src/po-snapshots.js';
import { buildSummary, scoreStories } from '../src/engines/backlog.js';
import { OUTCOMES, SAMPLE_BACKLOG, STAKEHOLDER_VOTES } from '../src/backlog-data.js';

const stories = scoreStories(SAMPLE_BACKLOG, STAKEHOLDER_VOTES);
const summary = buildSummary(stories, OUTCOMES);

describe('Sprint snapshots', () => {
  it('captures summary, total RICE, readiness % and per-story scores', () => {
    const snap = buildSnapshot(stories, summary, 'sample', 'manual');
    expect(snap.summary.total).toBe(12);
    expect(snap.readinessPct).toBe(Math.round((summary.ready / summary.total) * 100));
    expect(snap.totalRice).toBe(stories.reduce((s, x) => s + x.riceScore, 0));
    expect(snap.stories).toHaveLength(12);
    expect(snap.stories[0]).toHaveProperty('health');
  });

  it('trends: fewer than 2 snapshots → no deltas', () => {
    const one = buildTrends([buildSnapshot(stories, summary, 'sample', 'boot')]);
    expect(one.points).toHaveLength(1);
    expect(one.deltas).toBeNull();
  });

  it('trends: deltas = latest minus previous', () => {
    const a = buildSnapshot(stories, summary, 'sample', 'boot');
    const b: PoSnapshot = {
      ...buildSnapshot(stories, summary, 'sample', 'sync'),
      summary: { ...summary, ready: summary.ready + 2, avgHealth: summary.avgHealth + 6 },
      readinessPct: Math.round(((summary.ready + 2) / summary.total) * 100),
    };
    const t = buildTrends([a, b]);
    expect(t.points).toHaveLength(2);
    expect(t.deltas?.ready).toBe(2);
    expect(t.deltas?.avgHealth).toBe(6);
    expect(t.deltas?.total).toBe(0);
  });
});
