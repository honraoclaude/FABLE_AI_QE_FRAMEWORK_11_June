// Audit Trail — tamper-evident (hash-chained) log of every gate decision:
// DoR scores, 3 Amigos completions, DoD certifications, Go/No-Go computations,
// Jira write-backs and syncs. The FCA/SM&CR accountability surface.

import { useEffect, useState } from 'react';
import { IconShield } from '../icons';

interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  event: string;
  subject: string;
  details: Record<string, unknown>;
  hash: string;
}

interface AuditResponse {
  entries: AuditEntry[];
  chain: { valid: boolean; entries: number; brokenAt: string | null };
}

const EVENT_BADGE: Record<string, string> = {
  'gonogo.computed': 'warn',
  'dod.qe_verified': 'ok',
  'three_amigos.completed': 'ok',
};

export default function AuditView() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetch('/api/audit').then((r) => r.json()).then(setData).catch(() => undefined);
  }, []);

  if (!data) return <div className="skeleton" style={{ height: 240 }} />;

  const entries = data.entries.filter(
    (e) => filter === '' || `${e.event} ${e.subject}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Audit Trail</h2>
        {data.chain.valid ? (
          <span className="badge ok">chain intact · {data.chain.entries} records</span>
        ) : (
          <span className="badge bad">CHAIN BROKEN at {data.chain.brokenAt} — records were modified outside the portal</span>
        )}
        <span className="hint">Every gate decision is hash-chained — any retrospective edit breaks verification.</span>
      </div>

      <div className="legend">
        <input placeholder="Filter by event or subject…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter audit log" />
        <span>{entries.length} of {data.entries.length}</span>
      </div>

      {data.entries.length === 0 ? (
        <div className="panel empty">
          <div className="glyph"><IconShield width={20} height={20} /></div>
          <p className="hint">No decisions recorded yet — gate activity (DoR, 3 Amigos, DoD, Go/No-Go, Jira sync) appears here as it happens.</p>
        </div>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Event</th>
                <th scope="col">Subject</th>
                <th scope="col">Actor</th>
                <th scope="col">Evidence</th>
                <th scope="col">Hash</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="hint" style={{ whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleString()}</td>
                  <td><span className={`badge ${EVENT_BADGE[e.event] ?? 'muted'}`}>{e.event}</span></td>
                  <td>{e.subject}</td>
                  <td className="hint">{e.actor}</td>
                  <td className="hint" style={{ maxWidth: 420, wordBreak: 'break-word' }}>
                    {JSON.stringify(e.details)}
                  </td>
                  <td className="hint" title={e.hash}>{e.hash.slice(0, 10)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
