import { useEffect, useState } from 'react';
import { api, type ProductContext, type RbtFramework } from '../api';

const levelBadge = (level: string) =>
  level === 'critical' || level === 'high' ? 'bad' : level === 'medium' ? 'warn' : 'ok';

const text = (v: string) => v.trim();
const list = (v: string) => v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

export default function RbtView() {
  const [form, setForm] = useState({
    productName: '',
    industry: 'SaaS',
    applicationType: 'Web',
    businessProcesses: '',
    architecture: 'Cloud Native',
    integrations: '',
    userBase: '',
    geographies: '',
    regulations: '',
  });
  const [framework, setFramework] = useState<RbtFramework | null>(null);
  const [history, setHistory] = useState<{ id: string; createdAt: string; productName: string; riskCount: number; source: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshHistory = () => api.rbtList().then(setHistory).catch(() => undefined);
  useEffect(() => { refreshHistory(); }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const generate = async () => {
    setError(null);
    setBusy(true);
    try {
      const ctx: ProductContext = {
        productName: text(form.productName),
        industry: text(form.industry),
        applicationType: text(form.applicationType),
        businessProcesses: list(form.businessProcesses),
        architecture: text(form.architecture),
        integrations: list(form.integrations),
        userBase: text(form.userBase),
        geographies: text(form.geographies),
        regulations: list(form.regulations),
      };
      setFramework(await api.rbtGenerate(ctx));
      await refreshHistory();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const load = async (id: string) => {
    try {
      setFramework(await api.rbtGet(id));
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <section className="panel">
      <h2>Risk-Based Testing Approach</h2>
      <p className="hint">
        Describe the product context and the portal generates a complete RBT framework: categorized risk
        identification, 5×5 scoring, the product risk register, a per-level test strategy, a prioritization
        matrix, dashboard KPIs, and a governance model — exportable as CSV for Jira / Azure DevOps / Excel.
      </p>
      {error && <p role="alert" className="badge bad">{error}</p>}

      <fieldset>
        <legend>Product context</legend>
        <div className="grid2">
          <label className="row">Product name
            <input value={form.productName} onChange={set('productName')} style={{ font: 'inherit', flex: 1 }} />
          </label>
          <label className="row">Industry
            <select value={form.industry} onChange={set('industry')} style={{ font: 'inherit' }}>
              {['Banking', 'Insurance', 'Retail', 'Healthcare', 'Telecom', 'SaaS'].map((i) => <option key={i}>{i}</option>)}
            </select>
          </label>
          <label className="row">Application type
            <select value={form.applicationType} onChange={set('applicationType')} style={{ font: 'inherit' }}>
              {['Web', 'Mobile', 'API', 'Microservices', 'Data Platform'].map((i) => <option key={i}>{i}</option>)}
            </select>
          </label>
          <label className="row">Architecture
            <select value={form.architecture} onChange={set('architecture')} style={{ font: 'inherit' }}>
              {['Microservices', 'Monolith', 'Cloud Native', 'Hybrid'].map((i) => <option key={i}>{i}</option>)}
            </select>
          </label>
          <label className="row">User base
            <input value={form.userBase} onChange={set('userBase')} placeholder="e.g. 250,000 users" style={{ font: 'inherit', flex: 1 }} />
          </label>
          <label className="row">Geographies
            <input value={form.geographies} onChange={set('geographies')} placeholder="e.g. UK, EU" style={{ font: 'inherit', flex: 1 }} />
          </label>
        </div>
        <label className="row">Key business processes (comma-separated)
          <input value={form.businessProcesses} onChange={set('businessProcesses')} placeholder="e.g. Onboarding, Payments, Statements" style={{ font: 'inherit', flex: 1 }} />
        </label>
        <label className="row">Key integrations (comma-separated)
          <input value={form.integrations} onChange={set('integrations')} placeholder="e.g. Stripe, Salesforce" style={{ font: 'inherit', flex: 1 }} />
        </label>
        <label className="row">Regulatory requirements (comma-separated)
          <input value={form.regulations} onChange={set('regulations')} placeholder="e.g. GDPR, PCI-DSS" style={{ font: 'inherit', flex: 1 }} />
        </label>
        <button className="action" onClick={generate} disabled={busy}>
          {busy ? 'Generating…' : 'Generate RBT framework'}
        </button>
      </fieldset>

      {history.length > 0 && !framework && (
        <p className="hint">
          Previous assessments:{' '}
          {history.map((h) => (
            <button key={h.id} className="action" style={{ marginRight: '0.4rem' }} onClick={() => load(h.id)}>
              {h.productName} ({h.riskCount} risks)
            </button>
          ))}
        </p>
      )}

      {framework && (
        <>
          <div className="panel">
            <h3>Executive summary</h3>
            <p>{framework.executiveSummary}</p>
            <p className="hint">
              Source: {framework.source === 'ai' ? 'Claude AI (Senior QE Lead persona)' : 'rule-based template (AI not configured)'} ·{' '}
              <a href={`/api/rbt/${framework.id}/export.csv`}>Download risk register CSV (Jira / ADO / Excel)</a>
            </p>
          </div>

          <div className="panel">
            <h3>Risk scoring methodology</h3>
            <ul className="reasons">
              <li>{framework.scoringMethodology.impactScale}</li>
              <li>{framework.scoringMethodology.likelihoodScale}</li>
              <li>{framework.scoringMethodology.formula}</li>
              <li>{framework.scoringMethodology.classification}</li>
            </ul>
          </div>

          <div className="panel">
            <h3>Product risk register <span className="badge muted">{framework.risks.length} risks</span></h3>
            <table>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Area</th>
                  <th scope="col">Risk / root cause / business impact</th>
                  <th scope="col">I × L</th>
                  <th scope="col">Score</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Mitigation</th>
                </tr>
              </thead>
              <tbody>
                {[...framework.risks].sort((a, b) => b.score - a.score).map((r) => (
                  <tr key={r.riskId}>
                    <td><strong>{r.riskId}</strong></td>
                    <td>{r.area}</td>
                    <td>
                      {r.description}
                      <ul className="reasons">
                        <li>Root cause: {r.rootCause}</li>
                        <li>Business impact: {r.businessImpact}</li>
                      </ul>
                    </td>
                    <td>{r.impact} × {r.likelihood}</td>
                    <td><span className={`badge ${levelBadge(r.level)}`}>{r.score} — {r.level}</span></td>
                    <td><span className="badge muted">{r.owner}</span></td>
                    <td className="hint">{r.mitigation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <h3>Risk-based test strategy</h3>
            {framework.strategy.map((s) => (
              <div key={s.level}>
                <h4><span className={`badge ${levelBadge(s.level)}`}>{s.level.toUpperCase()}</span></h4>
                <ul className="reasons">
                  <li>Test types: {s.testTypes.join(', ')}</li>
                  <li>Automation target: {s.automationTarget}</li>
                  <li>Regression scope: {s.regressionScope}</li>
                  {s.performance && <li>Performance: {s.performance}</li>}
                  {s.security && <li>Security: {s.security}</li>}
                  {s.exploratory && <li>Exploratory: {s.exploratory}</li>}
                  <li>Release criteria: {s.releaseCriteria}</li>
                </ul>
              </div>
            ))}
          </div>

          <div className="panel">
            <h3>Test prioritization matrix</h3>
            <table>
              <thead>
                <tr>
                  <th scope="col">Product area</th>
                  <th scope="col">Risk level</th>
                  <th scope="col">Test type</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Automation candidate</th>
                </tr>
              </thead>
              <tbody>
                {framework.matrix.map((m, i) => (
                  <tr key={i}>
                    <td>{m.area}</td>
                    <td><span className={`badge ${levelBadge(m.riskLevel)}`}>{m.riskLevel}</span></td>
                    <td>{m.testType}</td>
                    <td>{m.priority}</td>
                    <td>{m.automationCandidate ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid2">
            <div className="panel">
              <h3>Release risk dashboard KPIs</h3>
              <table>
                <thead>
                  <tr>
                    <th scope="col">KPI</th>
                    <th scope="col">Definition</th>
                    <th scope="col">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {framework.kpis.map((k) => (
                    <tr key={k.kpi}>
                      <td>{k.kpi}</td>
                      <td className="hint">{k.definition}</td>
                      <td>{k.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel">
              <h3>QE governance model</h3>
              <h4>Review cadence</h4>
              <ul className="reasons">{framework.governance.reviewCadence.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <h4>Stakeholders</h4>
              <ul className="reasons">{framework.governance.stakeholders.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <h4>Escalation criteria</h4>
              <ul className="reasons">{framework.governance.escalationCriteria.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <h4>Entry gates</h4>
              <ul className="reasons">{framework.governance.entryGates.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <h4>Exit gates</h4>
              <ul className="reasons">{framework.governance.exitGates.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <h4>Release approval</h4>
              <ul className="reasons">{framework.governance.releaseApproval.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
