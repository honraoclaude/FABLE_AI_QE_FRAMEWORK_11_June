// SQLite persistence (better-sqlite3) using a JSON-document pattern so the
// data layer stays swappable for PostgreSQL (the production target, §16)
// without touching the engines.

import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AcScenario, Defect, Risk, Story, TestCase } from './types.js';

/** One tamper-evident audit record — each hash chains over the previous. */
export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  event: string; // e.g. "gonogo.computed", "three_amigos.completed"
  subject: string; // e.g. "story:SCRUM-5", "release:2024-Q2"
  details: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

function auditHash(e: Omit<AuditEntry, 'hash'>): string {
  return createHash('sha256')
    .update(`${e.prevHash}|${e.id}|${e.at}|${e.actor}|${e.event}|${e.subject}|${JSON.stringify(e.details)}`)
    .digest('hex');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function openDb(file?: string): Database.Database {
  const dbPath = file ?? process.env.QE_DB_PATH ?? path.join(__dirname, '..', 'qe-portal.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS stories   (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS scenarios (id TEXT PRIMARY KEY, story_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS risks     (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS defects   (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tests     (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rbt_frameworks (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS po_state (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS po_snapshots (id TEXT PRIMARY KEY, taken_at TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (seq INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_scenarios_story ON scenarios(story_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_taken ON po_snapshots(taken_at);
  `);
  return db;
}

export class Repo {
  constructor(private db: Database.Database) {}

  // --- stories ---
  saveStory(s: Story): void {
    this.db
      .prepare('INSERT INTO stories (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(s.id, JSON.stringify(s));
  }
  getStory(id: string): Story | null {
    const row = this.db.prepare('SELECT data FROM stories WHERE id = ?').get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Story) : null;
  }
  listStories(): Story[] {
    const rows = this.db.prepare('SELECT data FROM stories').all() as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as Story);
  }

  // --- AC scenarios ---
  saveScenario(s: AcScenario): void {
    this.db
      .prepare('INSERT INTO scenarios (id, story_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(s.id, s.storyId, JSON.stringify(s));
  }
  scenariosFor(storyId: string): AcScenario[] {
    const rows = this.db.prepare('SELECT data FROM scenarios WHERE story_id = ?').all(storyId) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as AcScenario);
  }
  deleteScenariosFor(storyId: string): void {
    this.db.prepare('DELETE FROM scenarios WHERE story_id = ?').run(storyId);
  }

  // --- risks ---
  saveRisk(r: Risk): void {
    this.db
      .prepare('INSERT INTO risks (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(r.id, JSON.stringify(r));
  }
  listRisks(): Risk[] {
    const rows = this.db.prepare('SELECT data FROM risks').all() as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as Risk);
  }
  getRisk(id: string): Risk | null {
    const row = this.db.prepare('SELECT data FROM risks WHERE id = ?').get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Risk) : null;
  }

  // --- defects ---
  saveDefect(d: Defect): void {
    this.db
      .prepare('INSERT INTO defects (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(d.id, JSON.stringify(d));
  }
  listDefects(): Defect[] {
    const rows = this.db.prepare('SELECT data FROM defects').all() as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as Defect);
  }

  // --- RBT frameworks ---
  saveRbtFramework(fw: { id: string }): void {
    this.db
      .prepare('INSERT INTO rbt_frameworks (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(fw.id, JSON.stringify(fw));
  }
  getRbtFramework<T>(id: string): T | null {
    const row = this.db.prepare('SELECT data FROM rbt_frameworks WHERE id = ?').get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : null;
  }
  listRbtFrameworks<T>(): T[] {
    const rows = this.db.prepare('SELECT data FROM rbt_frameworks').all() as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as T);
  }

  // --- Product Owner synced backlog (single-row key/value) ---
  savePoState<T>(key: string, value: T): void {
    this.db
      .prepare('INSERT INTO po_state (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(key, JSON.stringify(value));
  }
  getPoState<T>(key: string): T | null {
    const row = this.db.prepare('SELECT data FROM po_state WHERE id = ?').get(key) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : null;
  }
  clearPoState(key: string): void {
    this.db.prepare('DELETE FROM po_state WHERE id = ?').run(key);
  }

  // --- Audit trail (hash-chained, append-only) ---
  appendAudit(event: string, subject: string, details: Record<string, unknown>, actor = 'portal-user'): AuditEntry {
    const last = this.db
      .prepare('SELECT data FROM audit_log ORDER BY seq DESC LIMIT 1')
      .get() as { data: string } | undefined;
    const prevHash = last ? (JSON.parse(last.data) as AuditEntry).hash : 'genesis';
    const partial = {
      id: randomUUID(),
      at: new Date().toISOString(),
      actor,
      event,
      subject,
      details,
      prevHash,
    };
    const entry: AuditEntry = { ...partial, hash: auditHash(partial) };
    this.db.prepare('INSERT INTO audit_log (data) VALUES (?)').run(JSON.stringify(entry));
    return entry;
  }

  listAudit(limit = 200): AuditEntry[] {
    const rows = this.db
      .prepare('SELECT data FROM audit_log ORDER BY seq DESC LIMIT ?')
      .all(limit) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as AuditEntry); // newest first
  }

  /** Recompute every hash over the full chain — any tampering breaks it. */
  verifyAuditChain(): { valid: boolean; entries: number; brokenAt: string | null } {
    const rows = this.db.prepare('SELECT data FROM audit_log ORDER BY seq ASC').all() as { data: string }[];
    let prevHash = 'genesis';
    for (const row of rows) {
      const e = JSON.parse(row.data) as AuditEntry;
      const expected = auditHash({ ...e, prevHash });
      if (e.prevHash !== prevHash || e.hash !== expected) {
        return { valid: false, entries: rows.length, brokenAt: e.id };
      }
      prevHash = e.hash;
    }
    return { valid: true, entries: rows.length, brokenAt: null };
  }

  // --- Product Owner sprint snapshots (trend history) ---
  savePoSnapshot(snap: { id: string; takenAt: string }): void {
    this.db
      .prepare('INSERT INTO po_snapshots (id, taken_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(snap.id, snap.takenAt, JSON.stringify(snap));
  }
  listPoSnapshots<T>(limit = 24): T[] {
    const rows = this.db
      .prepare('SELECT data FROM po_snapshots ORDER BY taken_at DESC LIMIT ?')
      .all(limit) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as T).reverse(); // oldest → newest
  }

  // --- regression test cases ---
  saveTest(t: TestCase): void {
    this.db
      .prepare('INSERT INTO tests (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(t.id, JSON.stringify(t));
  }
  listTests(): TestCase[] {
    const rows = this.db.prepare('SELECT data FROM tests').all() as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as TestCase);
  }
}
