import { useState } from 'react';
import { api, type RegressionPack, type SelectedTest } from '../api';

function Tier({ title, note, tests }: { title: string; note: string; tests: SelectedTest[] }) {
  return (
    <div className="panel">
      <h3>{title} <span className="badge muted">{tests.length} test(s)</span></h3>
      <p className="hint">{note}</p>
      {tests.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">Test</th>
              <th scope="col">Module</th>
              <th scope="col">Selection reasons</th>
            </tr>
          </thead>
          <tbody>
            {tests.map(({ test, reasons }) => (
              <tr key={test.id}>
                <td>{test.name}</td>
                <td>{test.module}</td>
                <td>
                  <ul className="reasons">
                    {reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function RegressionView() {
  const [changed, setChanged] = useState('checkout');
  const [kind, setKind] = useState<'standard' | 'major'>('standard');
  const [pack, setPack] = useState<RegressionPack | null>(null);
  const [error, setError] = useState<string | null>(null);

  const build = async () => {
    try {
      const modules = changed.split(',').map((m) => m.trim()).filter(Boolean);
      setPack(await api.buildRegression(modules, kind));
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <section className="panel">
      <h2>Risk-Based Regression Pack</h2>
      <p className="hint">
        AI selection signals: risk register scores, changed modules, defect density, previously failed tests,
        regression-tagged AC.
      </p>
      {error && <p role="alert" className="badge bad">{error}</p>}

      <fieldset>
        <legend>Release inputs</legend>
        <label className="row">
          Changed modules (comma-separated)
          <input value={changed} onChange={(e) => setChanged(e.target.value)} style={{ font: 'inherit', padding: '0.2rem 0.4rem' }} />
        </label>
        <label className="row">
          Release kind
          <select value={kind} onChange={(e) => setKind(e.target.value as 'standard' | 'major')} style={{ font: 'inherit' }}>
            <option value="standard">standard</option>
            <option value="major">major (full regression)</option>
          </select>
        </label>
        <button className="action" onClick={build}>Build regression pack</button>
      </fieldset>

      {pack && (
        <>
          <Tier title="P1 — Smoke" note="Always runs, every release. Target < 10 min. Failure blocks release immediately." tests={pack.p1} />
          <Tier title="P2 — Risk-Based" note="Scoped by risk signals. Target < 2 h. Failure blocks pending triage." tests={pack.p2} />
          <Tier title="P3 — Full Regression" note="Pre-major release or quarterly. Failure risk-assessed at go/no-go." tests={pack.p3} />
          <Tier title="Quarantined (flaky)" note="Flagged separately — manual verify, never blocks a release." tests={pack.quarantined} />
        </>
      )}
    </section>
  );
}
