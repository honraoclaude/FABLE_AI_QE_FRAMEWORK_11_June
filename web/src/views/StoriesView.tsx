import { useEffect, useState } from 'react';
import { api, type DorResult, type InvestAssessment, type Scenario, type Story } from '../api';

const statusLabel = (s: string) => s.replaceAll('_', ' ');

const investBadge = (s: 'pass' | 'warn' | 'fail') => (s === 'pass' ? 'ok' : s === 'warn' ? 'warn' : 'bad');

export default function StoriesView() {
  const [stories, setStories] = useState<Story[]>([]);
  const [dor, setDor] = useState<Record<string, DorResult>>({});
  const [scenarios, setScenarios] = useState<Record<string, Scenario[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [jira, setJira] = useState<{ configured: boolean; hint: string | null } | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [invest, setInvest] = useState<Record<string, InvestAssessment>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [pushMsg, setPushMsg] = useState<Record<string, string>>({});

  const withPending = async (key: string, fn: () => Promise<void>) => {
    setPending((p) => ({ ...p, [key]: true }));
    try {
      await fn();
    } finally {
      setPending((p) => ({ ...p, [key]: false }));
    }
  };

  useEffect(() => {
    api.stories().then(setStories).catch((e) => setError(String(e)));
    api.jiraStatus().then(setJira).catch(() => setJira(null));
  }, []);

  const syncJira = async () => {
    setSyncMsg('Syncing from Jira…');
    try {
      const r = await api.jiraSync();
      setSyncMsg(`Jira sync: ${r.fetched} fetched, ${r.created} created, ${r.updated} updated (JQL: ${r.jql})`);
      setStories(await api.stories());
    } catch (e) {
      setSyncMsg(String(e));
    }
  };

  const checkDor = (id: string) =>
    withPending(`dor-${id}`, async () => {
      try {
        const { result } = await api.dor(id);
        setDor((prev) => ({ ...prev, [id]: result }));
      } catch (e) {
        setError(String(e));
      }
    });

  const checkInvest = (id: string) =>
    withPending(`invest-${id}`, async () => {
      try {
        const a = await api.invest(id);
        setInvest((prev) => ({ ...prev, [id]: a }));
      } catch (e) {
        setError(String(e));
      }
    });

  const pushAc = (id: string) =>
    withPending(`push-${id}`, async () => {
      try {
        const r = await api.pushAcToJira(id);
        setPushMsg((prev) => ({ ...prev, [id]: `Pushed ${r.pushed} scenarios to ${r.jiraKey} as a comment — ${r.url}` }));
      } catch (e) {
        setPushMsg((prev) => ({ ...prev, [id]: String(e) }));
      }
    });

  const generateAc = (id: string) =>
    withPending(`ac-${id}`, async () => {
      try {
        const { scenarios: list } = await api.generateAc(id);
        setScenarios((prev) => ({ ...prev, [id]: list }));
      } catch (e) {
        setError(String(e));
      }
    });

  return (
    <section className="panel">
      <h2>Story Pipeline</h2>
      <p className="hint">
        Stories flow Backlog → DoR gates → 3 Amigos → AC generation → Dev → dual DoD verification → Release.
      </p>
      <p>
        {jira?.configured ? (
          <button className="action" onClick={syncJira}>Sync from Jira</button>
        ) : (
          <span className="hint">
            Jira sync not configured — {jira?.hint ?? 'set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN on the server'}
          </span>
        )}
        {syncMsg && <span className="hint" role="status"> {syncMsg}</span>}
      </p>
      {error && <p role="alert" className="badge bad">{error}</p>}
      <table>
        <caption className="hint">All stories with lifecycle status and quality gates</caption>
        <thead>
          <tr>
            <th scope="col">Story</th>
            <th scope="col">Type</th>
            <th scope="col">Module</th>
            <th scope="col">Status</th>
            <th scope="col">DoR</th>
            <th scope="col">INVEST</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {stories.map((s) => {
            const d = dor[s.id];
            return (
              <tr key={s.id}>
                <td>{s.title}</td>
                <td>{s.type.replaceAll('_', ' ')}</td>
                <td>{s.module}</td>
                <td><span className="badge muted">{statusLabel(s.status)}</span></td>
                <td>
                  {d ? (
                    <>
                      <span className={`badge ${d.status === 'ready' ? 'ok' : d.status === 'conditionally_ready' ? 'warn' : 'bad'}`}>
                        {d.score}% — {statusLabel(d.status)}
                      </span>
                      {d.gaps.length > 0 && (
                        <ul className="reasons">
                          {d.gaps.slice(0, 3).map((g) => (
                            <li key={g.id}>{g.label} → {g.owner}</li>
                          ))}
                          {d.gaps.length > 3 && <li>…and {d.gaps.length - 3} more gap(s)</li>}
                        </ul>
                      )}
                    </>
                  ) : (
                    <button className="action" onClick={() => checkDor(s.id)} disabled={pending[`dor-${s.id}`]}>
                      {pending[`dor-${s.id}`] ? 'Checking…' : 'Check DoR'}
                    </button>
                  )}
                </td>
                <td>
                  {invest[s.id] ? (
                    <span
                      className={`badge ${invest[s.id]!.verdict === 'strong' ? 'ok' : invest[s.id]!.verdict === 'acceptable' ? 'warn' : 'bad'}`}
                    >
                      {invest[s.id]!.criteria.map((c) => (c.status === 'pass' ? c.letter : c.letter.toLowerCase())).join('')}
                      {' — '}
                      {invest[s.id]!.verdict}
                    </span>
                  ) : (
                    <button className="action" onClick={() => checkInvest(s.id)} disabled={pending[`invest-${s.id}`]}>
                      {pending[`invest-${s.id}`] ? 'Assessing with AI…' : 'Check INVEST'}
                    </button>
                  )}
                </td>
                <td>
                  <button className="action" onClick={() => generateAc(s.id)} disabled={pending[`ac-${s.id}`]}>
                    {pending[`ac-${s.id}`] ? 'Generating with AI…' : 'Generate AC'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {Object.entries(invest).map(([storyId, a]) => {
        const story = stories.find((s) => s.id === storyId);
        return (
          <div key={`invest-${storyId}`} className="panel" style={{ marginTop: '1rem' }}>
            <h3>INVEST — {story?.title}</h3>
            <p className="hint">
              {a.summary} (source: {a.source === 'ai' ? 'Claude AI' : 'heuristic rules — AI not configured'})
            </p>
            <table>
              <thead>
                <tr>
                  <th scope="col">Criterion</th>
                  <th scope="col">Question</th>
                  <th scope="col">Status</th>
                  <th scope="col">Findings &amp; suggestion</th>
                </tr>
              </thead>
              <tbody>
                {a.criteria.map((c) => (
                  <tr key={c.letter}>
                    <td><strong>{c.letter}</strong> — {c.name}</td>
                    <td className="hint">{c.question}</td>
                    <td><span className={`badge ${investBadge(c.status)}`}>{c.status}</span></td>
                    <td>
                      <ul className="reasons">
                        {c.findings.map((f, i) => <li key={i}>{f}</li>)}
                        {c.suggestion && <li><strong>Fix:</strong> {c.suggestion}</li>}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {Object.entries(scenarios).map(([storyId, list]) => {
        const story = stories.find((s) => s.id === storyId);
        return (
          <div key={storyId} className="panel" style={{ marginTop: '1rem' }}>
            <h3>Acceptance Criteria — {story?.title}</h3>
            <p className="hint">
              Source: {list[0]?.source === 'ai' ? 'Claude AI' : 'deterministic template (AI not configured)'}
              {story?.jiraKey && (
                <>
                  {' · '}
                  <button className="action" onClick={() => pushAc(storyId)} disabled={pending[`push-${storyId}`]}>
                    {pending[`push-${storyId}`] ? 'Pushing…' : `Push AC to ${story.jiraKey}`}
                  </button>
                </>
              )}
            </p>
            {pushMsg[storyId] && <p className="hint" role="status">{pushMsg[storyId]}</p>}
            <table>
              <thead>
                <tr>
                  <th scope="col">Scenario</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Gherkin</th>
                  <th scope="col">Test types</th>
                  <th scope="col">Automation</th>
                </tr>
              </thead>
              <tbody>
                {list.map((sc) => (
                  <tr key={sc.id}>
                    <td>{sc.title}</td>
                    <td><span className="badge muted">{sc.kind}</span></td>
                    <td>
                      <em>Given</em> {sc.gherkin.given}<br />
                      <em>When</em> {sc.gherkin.when}<br />
                      <em>Then</em> {sc.gherkin.then}
                    </td>
                    <td>{sc.testTypes.join(', ').replaceAll('_', ' ')}</td>
                    <td>
                      {sc.automationCandidate ? (
                        <span className="badge ok">automate ({sc.automationLayer})</span>
                      ) : (
                        <span className="badge warn">manual</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}
