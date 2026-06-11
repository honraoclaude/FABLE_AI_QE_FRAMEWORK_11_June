import { useEffect, useState } from 'react';
import { api, type Risk } from '../api';

export default function RisksView() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.risks().then((r) => setRisks(r.risks)).catch((e) => setError(String(e)));
  }, []);

  const sorted = [...risks].sort((a, b) => b.score - a.score);

  return (
    <section className="panel">
      <h2>Product Risk Register</h2>
      <p className="hint">
        Severity × likelihood scoring: 1–3 monitor · 4–6 assign mitigation · ≥8 immediate action, QE Lead notified.
      </p>
      {error && <p role="alert" className="badge bad">{error}</p>}
      <table>
        <caption className="hint">Open risks ordered by score</caption>
        <thead>
          <tr>
            <th scope="col">Risk</th>
            <th scope="col">Type</th>
            <th scope="col">Module</th>
            <th scope="col">Sev × Lik</th>
            <th scope="col">Score</th>
            <th scope="col">Required action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              <td>{r.description}</td>
              <td>{r.type.replaceAll('_', ' ')}</td>
              <td>{r.module}</td>
              <td>{r.severity} × {r.likelihood}</td>
              <td>
                <span className={`badge ${r.band === 'high' ? 'bad' : r.band === 'medium' ? 'warn' : 'ok'}`}>
                  {r.score} — {r.band}
                </span>
              </td>
              <td>{r.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
