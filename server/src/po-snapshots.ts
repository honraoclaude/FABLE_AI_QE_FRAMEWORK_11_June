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
