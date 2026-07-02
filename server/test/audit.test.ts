import { describe, expect, it } from 'vitest';
import { openDb, Repo } from '../src/db.js';

function memRepo(): Repo {
  return new Repo(openDb(':memory:'));
}

describe('Hash-chained audit trail', () => {
  it('appends entries with a verifiable chain', () => {
    const repo = memRepo();
    repo.appendAudit('dor.scored', 'story:X-1', { score: 80 });
    repo.appendAudit('gonogo.computed', 'release:r1', { score: 91, recommendation: 'go' });

    const entries = repo.listAudit();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.event).toBe('gonogo.computed'); // newest first
    expect(entries[1]?.prevHash).toBe('genesis');
    expect(entries[0]?.prevHash).toBe(entries[1]?.hash);

    const chain = repo.verifyAuditChain();
    expect(chain.valid).toBe(true);
    expect(chain.entries).toBe(2);
  });

  it('detects tampering anywhere in the chain', () => {
    const repo = memRepo();
    repo.appendAudit('a', 's:1', { v: 1 });
    const target = repo.appendAudit('b', 's:2', { v: 2 });
    repo.appendAudit('c', 's:3', { v: 3 });

    // Tamper with the middle record directly in the table.
    const db = (repo as unknown as { db: import('better-sqlite3').Database }).db;
    const rows = db.prepare('SELECT seq, data FROM audit_log ORDER BY seq ASC').all() as { seq: number; data: string }[];
    const mid = rows.find((r) => (JSON.parse(r.data) as { id: string }).id === target.id)!;
    const doctored = JSON.parse(mid.data) as { details: { v: number } };
    doctored.details.v = 999; // fraudulent edit
    db.prepare('UPDATE audit_log SET data = ? WHERE seq = ?').run(JSON.stringify(doctored), mid.seq);

    const chain = repo.verifyAuditChain();
    expect(chain.valid).toBe(false);
    expect(chain.brokenAt).toBe(target.id);
  });
});
