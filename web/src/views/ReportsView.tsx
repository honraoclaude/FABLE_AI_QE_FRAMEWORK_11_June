// Reports — export surface for leadership packs and tool integrations.

import { useEffect, useState } from 'react';
import { IconReport } from '../icons';

interface RbtItem { id: string; createdAt: string; productName: string; riskCount: number; source: string }

export default function ReportsView() {
  const [frameworks, setFrameworks] = useState<RbtItem[]>([]);

  useEffect(() => {
    fetch('/api/rbt').then((r) => r.json()).then(setFrameworks).catch(() => undefined);
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Reports</h2>
        <span className="hint">Exports for leadership reviews and tool integrations</span>
      </div>

      <div className="grid2">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Risk register exports (CSV)</h3>
          <p className="hint">Generated RBT frameworks, importable into Jira, Azure DevOps, or Excel.</p>
          {frameworks.length === 0 ? (
            <div className="empty">
              <div className="glyph"><IconReport width={20} height={20} /></div>
              <p className="hint">No frameworks yet — generate one in the RBT Testing tab.</p>
            </div>
          ) : (
            <table>
              <thead><tr><th scope="col">Product</th><th scope="col">Created</th><th scope="col">Risks</th><th scope="col">Source</th><th scope="col">Export</th></tr></thead>
              <tbody>
                {frameworks.map((f) => (
                  <tr key={f.id}>
                    <td>{f.productName}</td>
                    <td className="hint">{new Date(f.createdAt).toLocaleString()}</td>
                    <td>{f.riskCount}</td>
                    <td><span className="badge muted">{f.source}</span></td>
                    <td><a href={`/api/rbt/${f.id}/export.csv`}>Download CSV</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Executive dashboard snapshot</h3>
          <p className="hint">
            The Dashboard and Product Owner Overview are print-optimised — use your browser's Print (Ctrl+P) with
            "Save as PDF" for leadership packs. Dark mode is automatically flattened by the browser for print.
          </p>
          <button className="action" onClick={() => window.print()}>Print current view</button>
          <h3>Jira write-back</h3>
          <p className="hint">
            Acceptance criteria push to stories as comments from the Story Pipeline; 3 Amigos actions create
            owner-tagged sub-tasks. Both are one click in their respective tabs once a story is synced.
          </p>
        </div>
      </div>
    </div>
  );
}
