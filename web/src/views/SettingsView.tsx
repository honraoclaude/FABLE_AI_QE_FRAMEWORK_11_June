// Settings — live configuration status (read-only view over the server env).

import { useEffect, useState } from 'react';

interface JiraStatus { configured: boolean; jql: string | null }

export default function SettingsView() {
  const [ai, setAi] = useState<boolean | null>(null);
  const [jira, setJira] = useState<JiraStatus | null>(null);
  const [poJql, setPoJql] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then((h) => setAi(Boolean(h.ai))).catch(() => setAi(false));
    fetch('/api/jira/status').then((r) => r.json()).then(setJira).catch(() => undefined);
    fetch('/api/po/jira/status').then((r) => r.json()).then((d) => setPoJql(d.jql)).catch(() => undefined);
  }, []);

  const row = (label: string, ok: boolean | null, detail: string) => (
    <tr>
      <td style={{ fontWeight: 600 }}>{label}</td>
      <td>{ok === null ? <span className="badge muted">checking…</span> : ok ? <span className="badge ok">configured</span> : <span className="badge warn">not configured</span>}</td>
      <td className="hint">{detail}</td>
    </tr>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Settings</h2>
        <span className="hint">Server configuration is env-driven (.env) — this page shows live status</span>
      </div>

      <div className="panel">
        <table>
          <thead><tr><th scope="col">Integration</th><th scope="col">Status</th><th scope="col">Details</th></tr></thead>
          <tbody>
            {row('Claude AI (AC · INVEST · risks · RBT · Copilot)', ai,
              ai ? 'ANTHROPIC_API_KEY active — AI generation is live' : 'Set ANTHROPIC_API_KEY and remove QE_DISABLE_AI in .env, then restart. All features fall back to deterministic engines meanwhile.')}
            {row('Jira sync (Story Pipeline)', jira?.configured ?? null, jira?.jql ? `JQL: ${jira.jql}` : 'Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN in .env')}
            {row('Jira sync (Product Owner backlog)', jira?.configured ?? null, poJql ? `JQL: ${poJql} (override with JIRA_PO_JQL)` : '—')}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Appearance</h3>
        <p className="hint">Theme (light/dark) is toggled from the header and remembered per browser. Layout follows an 8px spacing system with WCAG AA contrast in both themes.</p>
        <h3>Keyboard</h3>
        <p className="hint"><strong>Ctrl+K</strong> — command palette · <strong>Esc</strong> — close overlays · full keyboard navigation with visible focus rings.</p>
      </div>
    </div>
  );
}
