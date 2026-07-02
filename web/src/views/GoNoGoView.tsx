import { useState } from 'react';
import { api, type Scorecard } from '../api';

const SIGNALS = [
  { key: 'p1SmokeTests', label: 'P1 Smoke Tests (20%)' },
  { key: 'p2RiskBasedTests', label: 'P2 Risk-Based Tests (15%)' },
  { key: 'dodCompliance', label: 'DoD Compliance (15%)' },
  { key: 'riskRegisterStatus', label: 'Risk Register Status (15%)' },
  { key: 'acCoverage', label: 'AC Coverage (10%)' },
  { key: 'defectDensity', label: 'Defect Density (10%)' },
  { key: 'securityScan', label: 'Security Scan (10%)' },
  { key: 'performanceBudget', label: 'Performance Budget (5%)' },
] as const;

const REC_LABEL: Record<Scorecard['recommendation'], { text: string; cls: string }> = {
  go: { text: 'GO', cls: 'ok' },
  conditional_go: { text: 'CONDITIONAL GO', cls: 'warn' },
  high_risk_go: { text: 'HIGH RISK GO', cls: 'warn' },
  no_go: { text: 'NO GO', cls: 'bad' },
};

export default function GoNoGoView() {
  const [signals, setSignals] = useState<Record<string, number>>(
    Object.fromEntries(SIGNALS.map((s) => [s.key, 100])),
  );
  const [criticalBugs, setCriticalBugs] = useState(0);
  const [p1Passing, setP1Passing] = useState(true);
  const [poSignOff, setPoSignOff] = useState(true);
  const [card, setCard] = useState<Scorecard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Record<string, string> | null>(null);
  const [blockerNotes, setBlockerNotes] = useState<string[]>([]);
  const [autoBusy, setAutoBusy] = useState(false);

  const autoPopulate = async () => {
    setAutoBusy(true);
    setError(null);
    try {
      const live = await fetch('/api/gonogo/live').then((r) => r.json());
      setSignals(Object.fromEntries(Object.entries(live.signals).map(([k, v]) => [k, (v as { value: number }).value])));
      setCriticalBugs(live.blockers.criticalBugsOpen);
      setP1Passing(live.blockers.p1SmokeAllPassing);
      setPoSignOff(false); // always a human decision
      setEvidence(Object.fromEntries(Object.entries(live.signals).map(([k, v]) => [k, (v as { evidence: string }).evidence])));
      setBlockerNotes(live.blockers.notes);
    } catch (e) {
      setError(String(e));
    } finally {
      setAutoBusy(false);
    }
  };

  const compute = async () => {
    try {
      setCard(
        await api.gonogo({
          blockers: { criticalBugsOpen: criticalBugs, p1SmokeAllPassing: p1Passing, poSignOffReceived: poSignOff },
          signals,
        }),
      );
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <section className="panel">
      <h2>Go / No-Go Scorecard</h2>
      <p className="hint">System recommends; QE Lead, PO, and Release Manager approve. Hard blockers gate the release outright.</p>
      <p>
        <button className="action" onClick={autoPopulate} disabled={autoBusy}>
          {autoBusy ? 'Deriving…' : 'Auto-populate from live portal data'}
        </button>{' '}
        <span className="hint">Fills every signal from stories, tests, defects and risks — with evidence. PO sign-off stays manual.</span>
      </p>
      {blockerNotes.length > 0 && (
        <ul className="reasons">{blockerNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}
      {error && <p role="alert" className="badge bad">{error}</p>}

      <div className="grid2">
        <fieldset>
          <legend>Hard blockers</legend>
          <label className="row">
            Critical bugs open
            <input type="number" min={0} value={criticalBugs} onChange={(e) => setCriticalBugs(Number(e.target.value))} />
          </label>
          <label className="row">
            <input type="checkbox" checked={p1Passing} onChange={(e) => setP1Passing(e.target.checked)} />
            All P1 smoke tests passing
          </label>
          <label className="row">
            <input type="checkbox" checked={poSignOff} onChange={(e) => setPoSignOff(e.target.checked)} />
            PO sign-off received
          </label>
        </fieldset>

        <fieldset>
          <legend>Quality signals (0–100)</legend>
          {SIGNALS.map((s) => (
            <div key={s.key}>
              <label className="row">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={signals[s.key]}
                  onChange={(e) => setSignals((prev) => ({ ...prev, [s.key]: Number(e.target.value) }))}
                />
                {s.label}
              </label>
              {evidence?.[s.key] && <div className="hint" style={{ margin: '0 0 6px 4px' }}>↳ {evidence[s.key]}</div>}
            </div>
          ))}
        </fieldset>
      </div>

      <button className="action" onClick={compute}>Compute scorecard</button>

      {card && (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <p className="scorebox">
            {card.score}/100{' '}
            <span className={`badge ${REC_LABEL[card.recommendation].cls}`}>{REC_LABEL[card.recommendation].text}</span>
          </p>
          <p><strong>Approval required:</strong> {card.approvalRequired}</p>
          {card.blockerFailures.length > 0 && (
            <ul className="reasons" role="alert">
              {card.blockerFailures.map((b, i) => <li key={i}>Hard blocker: {b}</li>)}
            </ul>
          )}
          <table>
            <thead>
              <tr>
                <th scope="col">Signal</th>
                <th scope="col">Weight</th>
                <th scope="col">Sub-score</th>
                <th scope="col">Weighted</th>
              </tr>
            </thead>
            <tbody>
              {card.breakdown.map((b) => (
                <tr key={b.signal}>
                  <td>{b.signal}</td>
                  <td>{b.weight}%</td>
                  <td>{b.subScore}</td>
                  <td>{b.weighted.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
