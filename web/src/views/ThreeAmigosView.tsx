import { useEffect, useState } from 'react';
import { api, type Story, type ThreeAmigosEvaluation } from '../api';

const investBadge = (s: 'pass' | 'warn' | 'fail') => (s === 'pass' ? 'ok' : s === 'warn' ? 'warn' : 'bad');

export default function ThreeAmigosView() {
  const [stories, setStories] = useState<Story[]>([]);
  const [evals, setEvals] = useState<Record<string, ThreeAmigosEvaluation>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.stories().then(setStories).catch((e) => setError(String(e)));
  useEffect(() => { refresh(); }, []);

  const evaluate = async (id: string) => {
    try {
      const ev = await api.threeAmigosEvaluate(id);
      setEvals((prev) => ({ ...prev, [id]: ev }));
      setMessages((prev) => ({ ...prev, [id]: ev.message }));
    } catch (e) {
      setError(String(e));
    }
  };

  const toggle = async (storyId: string, actionId: string) => {
    try {
      await api.toggleAction(storyId, actionId);
      await evaluate(storyId); // re-derive open count + readiness
    } catch (e) {
      setError(String(e));
    }
  };

  const complete = async (id: string) => {
    try {
      const r = await api.threeAmigosComplete(id);
      setMessages((prev) => ({ ...prev, [id]: r.message }));
      await refresh();
    } catch (e) {
      setMessages((prev) => ({ ...prev, [id]: String(e) }));
    }
  };

  const reopen = async (id: string) => {
    try {
      const r = await api.threeAmigosReopen(id);
      setMessages((prev) => ({ ...prev, [id]: r.message }));
      await refresh();
    } catch (e) {
      setMessages((prev) => ({ ...prev, [id]: String(e) }));
    }
  };

  const candidates = stories.filter((s) => s.status !== 'released');

  return (
    <section className="panel">
      <h2>3 Amigos Evaluator</h2>
      <p className="hint">
        Each story is evaluated against INVEST; weak criteria become owned actions for BA / Dev / PO / QA.
        A story can only be marked 3 Amigos Complete once every action is resolved.
      </p>
      {error && <p role="alert" className="badge bad">{error}</p>}

      {candidates.map((s) => {
        const ev = evals[s.id];
        return (
          <div key={s.id} className="panel" style={{ marginTop: '0.75rem' }}>
            <h3>
              {s.jiraKey ? `${s.jiraKey} — ` : ''}{s.title}{' '}
              <span className="badge muted">{s.status.replaceAll('_', ' ')}</span>
            </h3>
            {!ev ? (
              <button className="action" onClick={() => evaluate(s.id)}>Evaluate story</button>
            ) : (
              <>
                <p>
                  <span className={`badge ${ev.invest.verdict === 'strong' ? 'ok' : ev.invest.verdict === 'acceptable' ? 'warn' : 'bad'}`}>
                    INVEST: {ev.invest.verdict}
                  </span>{' '}
                  {ev.invest.criteria.map((c) => (
                    <span key={c.letter} className={`badge ${investBadge(c.status)}`} title={`${c.name}: ${c.status}`}>
                      {c.letter}
                    </span>
                  ))}{' '}
                  <span className="hint">({ev.invest.source === 'ai' ? 'Claude AI' : 'heuristic'})</span>
                </p>

                {ev.actions.length > 0 ? (
                  <table>
                    <caption className="hint">Actions raised by the evaluator</caption>
                    <thead>
                      <tr>
                        <th scope="col">Done</th>
                        <th scope="col">Owner</th>
                        <th scope="col">Action</th>
                        <th scope="col">Raised by</th>
                        <th scope="col">Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ev.actions.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={a.done}
                              onChange={() => toggle(s.id, a.id)}
                              aria-label={`Mark done: ${a.description}`}
                            />
                          </td>
                          <td><span className="badge muted">{a.owner}</span></td>
                          <td>{a.description}</td>
                          <td className="hint">{a.source}</td>
                          <td>
                            <span className={`badge ${a.severity === 'blocker' ? 'bad' : 'warn'}`}>{a.severity}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="hint">No actions — all six INVEST criteria pass.</p>
                )}

                <p>
                  {s.status === 'three_amigos_complete' ? (
                    <button className="action" onClick={() => reopen(s.id)}>
                      Reopen — back to readiness review
                    </button>
                  ) : (
                    <button className="action" onClick={() => complete(s.id)} disabled={!ev.ready}>
                      Mark 3 Amigos Complete
                    </button>
                  )}{' '}
                  <button className="action" onClick={() => evaluate(s.id)}>Re-evaluate</button>
                </p>
              </>
            )}
            {messages[s.id] && <p className="hint" role="status">{messages[s.id]}</p>}
          </div>
        );
      })}
    </section>
  );
}
