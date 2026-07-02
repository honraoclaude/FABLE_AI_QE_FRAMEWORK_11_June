// Sprint snapshots — persist the scored backlog summary over time so the
// executive dashboard's trends are real sprint-over-sprint data, not
// indicative curves. Snapshots are taken on server boot (if stale), on every
// Jira sync/reset, and on demand.

import { randomUUID } from 'node:crypto';
import type { Repo } from './db.js';
import type { BacklogSummary, ScoredStory } from './engines/backlog.js';

export type SnapshotTrigger = 'boot' | 'sync' | 'reset' | 'manual';

export interface PoSnapshot {
  id: string;
  takenAt: string;
  source: 'sample' | 'jira';
  trigger: SnapshotTrigger;
  summary: BacklogSummary;
  totalRice: number;
  readinessPct: number;
  stories: { id: string; health: number; riceScore: number; rank: number; status: string; conflictIdx: number }[];
}

export function buildSnapshot(
  stories: ScoredStory[],
  summary: BacklogSummary,
  source: 'sample' | 'jira',
  trigger: SnapshotTrigger,
): PoSnapshot {
  return {
    id: randomUUID(),
    takenAt: new Date().toISOString(),
    source,
    trigger,
    summary,
    totalRice: stories.reduce((sum, s) => sum + s.riceScore, 0),
    readinessPct: summary.total > 0 ? Math.round((summary.ready / summary.total) * 100) : 0,
    stories: stories.map((s) => ({
      id: s.id, health: s.health, riceScore: s.riceScore, rank: s.rank, status: s.status, conflictIdx: s.conflictIdx,
    })),
  };
}

const BOOT_STALE_MS = 12 * 60 * 60 * 1000; // boot snapshots at most every 12h

/**
 * Persist a snapshot. Boot-triggered snapshots are skipped when a recent one
 * exists (so restarts don't flood the history); sync/reset/manual always record.
 */
export function takeSnapshot(
  repo: Repo,
  stories: ScoredStory[],
  summary: BacklogSummary,
  source: 'sample' | 'jira',
  trigger: SnapshotTrigger,
): PoSnapshot | null {
  if (trigger === 'boot') {
    const existing = repo.listPoSnapshots<PoSnapshot>(1);
    const last = existing[existing.length - 1];
    if (last && Date.now() - Date.parse(last.takenAt) < BOOT_STALE_MS) return null;
  }
  const snap = buildSnapshot(stories, summary, source, trigger);
  repo.savePoSnapshot(snap);
  return snap;
}

// ── Trend series for the dashboard ──────────────────────────────────────────

export interface TrendPoint {
  takenAt: string;
  trigger: SnapshotTrigger;
  source: 'sample' | 'jira';
  total: number;
  ready: number;
  refine: number;
  blocked: number;
  avgHealth: number;
  dorReady: number;
  regulatedCount: number;
  avgConflict: number;
  totalRice: number;
  readinessPct: number;
}

export interface Trends {
  points: TrendPoint[];
  /** latest minus previous per metric — null when fewer than 2 snapshots */
  deltas: Partial<Record<keyof Omit<TrendPoint, 'takenAt' | 'trigger' | 'source'>, number>> | null;
}

// ── Prediction accuracy (framework §15 continuous improvement) ─────────────

export interface StoryDrift {
  id: string;
  firstSeen: string;
  snapshotsObserved: number;
  initialHealth: number;
  latestHealth: number;
  healthDelta: number;
  initialStatus: string;
  latestStatus: string;
  stuckInRefinement: boolean; // predicted "Needs Refinement" and never improved
  delivered: boolean | null; // matched against the QE pipeline when linkable
}

export interface PredictionReport {
  snapshots: number;
  spanDays: number;
  stories: StoryDrift[];
  summary: {
    improved: number;
    degraded: number;
    unchanged: number;
    stuckInRefinement: number;
    avgHealthDelta: number;
  };
  recalibrationHints: string[];
  note: string | null;
}

/**
 * Compare each story's first-seen prediction (health/status) against its
 * latest snapshot, and against actual delivery where the QE pipeline knows the
 * story (matched by id/jiraKey). Produces §15-style recalibration hints.
 */
export function analyzePredictions(
  snapshots: PoSnapshot[],
  deliveredIds: Set<string>,
): PredictionReport {
  if (snapshots.length < 2) {
    return {
      snapshots: snapshots.length,
      spanDays: 0,
      stories: [],
      summary: { improved: 0, degraded: 0, unchanged: 0, stuckInRefinement: 0, avgHealthDelta: 0 },
      recalibrationHints: [],
      note: 'Prediction tracking needs at least 2 snapshots — history accrues on every Jira sync and server boot.',
    };
  }

  const first = new Map<string, { snap: PoSnapshot; s: PoSnapshot['stories'][number] }>();
  const latest = new Map<string, { snap: PoSnapshot; s: PoSnapshot['stories'][number] }>();
  const seenCount = new Map<string, number>();
  for (const snap of snapshots) {
    for (const s of snap.stories) {
      if (!first.has(s.id)) first.set(s.id, { snap, s });
      latest.set(s.id, { snap, s });
      seenCount.set(s.id, (seenCount.get(s.id) ?? 0) + 1);
    }
  }

  const stories: StoryDrift[] = [...first.entries()]
    .filter(([id]) => (seenCount.get(id) ?? 0) >= 2)
    .map(([id, f]) => {
      const l = latest.get(id)!;
      return {
        id,
        firstSeen: f.snap.takenAt,
        snapshotsObserved: seenCount.get(id) ?? 0,
        initialHealth: f.s.health,
        latestHealth: l.s.health,
        healthDelta: l.s.health - f.s.health,
        initialStatus: f.s.status,
        latestStatus: l.s.status,
        stuckInRefinement: f.s.status === 'Needs Refinement' && l.s.status === 'Needs Refinement',
        delivered: deliveredIds.size > 0 ? deliveredIds.has(id) : null,
      };
    });

  const improved = stories.filter((s) => s.healthDelta > 0).length;
  const degraded = stories.filter((s) => s.healthDelta < 0).length;
  const stuck = stories.filter((s) => s.stuckInRefinement).length;
  const avgDelta = stories.length
    ? Math.round((stories.reduce((sum, s) => sum + s.healthDelta, 0) / stories.length) * 10) / 10
    : 0;

  const hints: string[] = [];
  if (stuck > 0 && stuck >= stories.length / 3) {
    hints.push(`${stuck} of ${stories.length} tracked stories have sat in "Needs Refinement" across every snapshot — the 70% readiness threshold may be too strict for this backlog, or refinement sessions are not converting. Review before recalibrating weights.`);
  }
  if (degraded > improved) {
    hints.push('More stories degraded than improved between snapshots — scope creep or re-scoring after discovery. Consider requiring a re-run of the 3 Amigos evaluator when health drops.');
  }
  if (stories.some((s) => s.delivered === true && s.initialHealth < 70)) {
    hints.push('Stories predicted "not ready" (<70% health) were still delivered — either the team is overriding the gate or the INVEST weighting under-scores this backlog. Compare against escaped-defect data before adjusting.');
  }
  if (hints.length === 0) {
    hints.push('No recalibration signal yet — predictions and outcomes are consistent so far. Keep accruing snapshots across sprint boundaries for a meaningful §15 review.');
  }

  const spanDays = Math.round(
    (Date.parse(snapshots[snapshots.length - 1]!.takenAt) - Date.parse(snapshots[0]!.takenAt)) / 86400000,
  );

  return {
    snapshots: snapshots.length,
    spanDays,
    stories: stories.sort((a, b) => a.healthDelta - b.healthDelta),
    summary: { improved, degraded, unchanged: stories.length - improved - degraded, stuckInRefinement: stuck, avgHealthDelta: avgDelta },
    recalibrationHints: hints,
    note: spanDays < 1 ? 'Snapshots span less than a day — drift figures are directional only until history crosses sprint boundaries.' : null,
  };
}

export function buildTrends(snapshots: PoSnapshot[]): Trends {
  const points: TrendPoint[] = snapshots.map((s) => ({
    takenAt: s.takenAt,
    trigger: s.trigger,
    source: s.source,
    total: s.summary.total,
    ready: s.summary.ready,
    refine: s.summary.refine,
    blocked: s.summary.blocked,
    avgHealth: s.summary.avgHealth,
    dorReady: s.summary.dorReady,
    regulatedCount: s.summary.regulatedCount,
    avgConflict: s.summary.avgConflict,
    totalRice: s.totalRice,
    readinessPct: s.readinessPct,
  }));

  let deltas: Trends['deltas'] = null;
  if (points.length >= 2) {
    const a = points[points.length - 2]!;
    const b = points[points.length - 1]!;
    deltas = {
      total: b.total - a.total,
      ready: b.ready - a.ready,
      refine: b.refine - a.refine,
      blocked: b.blocked - a.blocked,
      avgHealth: b.avgHealth - a.avgHealth,
      dorReady: b.dorReady - a.dorReady,
      regulatedCount: b.regulatedCount - a.regulatedCount,
      avgConflict: b.avgConflict - a.avgConflict,
      totalRice: b.totalRice - a.totalRice,
      readinessPct: b.readinessPct - a.readinessPct,
    };
  }
  return { points, deltas };
}
