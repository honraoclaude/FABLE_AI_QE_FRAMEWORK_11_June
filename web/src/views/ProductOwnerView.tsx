import { useEffect, useMemo, useState } from 'react';
import {
  po,
  type Backlog,
  type ConflictResolution,
  type Fairness,
  type JiraPoStatus,
  type Refinement,
  type Roadmap,
  type Scenario,
  type ScoredStory,
  type SprintPlan,
} from '../po-api';

const TYPE_COLORS: Record<string, string> = { FIX: '#1F3864', BUILD: '#1E6B4A', COMPLY: '#B5520F', ENHANCE: '#5C277F' };
const INVEST_LETTERS = ['I', 'N', 'V', 'E', 'S', 'T'] as const;
const investColor = (v: number) => (v >= 4 ? '#1E6B4A' : v >= 3 ? '#C55A11' : '#8B1A1A');
const statusBadge = (s: string) => (s === 'Sprint Ready' ? 'ok' : s === 'Needs Refinement' ? 'warn' : 'bad');

const SUBTABS = [
  ['overview', 'Overview'],
  ['stories', 'Stories (TPO)'],
  ['heatmap', 'Risk Heatmap'],
  ['sprint', 'Sprint Builder'],
  ['scenarios', 'Scenario Planner'],
  ['roadmap', 'Roadmap Forecaster'],
  ['dor', 'DoR Gate'],
  ['deps', 'Dependencies'],
  ['tension', 'Tension Board'],
  ['outcomes', 'Outcome Map'],
  ['fairness', 'Stakeholder Fairness'],
  ['refine', 'Story Refinement'],
  ['conflicts', 'Conflict Resolver'],
] as const;
type SubTab = (typeof SUBTABS)[number][0];

function InvestDots({ invest }: { invest: ScoredStory['invest'] }) {
  return (
    <div className="invest-dots" aria-label="INVEST dimension scores">
      {INVEST_LETTERS.map((l) => (
        <span key={l} style={{ background: investColor(invest[l]) }} title={`${l}: ${invest[l]}/5`}>{l}</span>
      ))}
    </div>
  );
}

function HealthBar({ health }: { health: number }) {
  const color = health >= 70 ? '#1E6B4A' : health >= 40 ? '#C55A11' : '#8B1A1A';
  return (
    <div className="healthbar-bg" title={`INVEST health ${health}%`}>
      <div className="healthbar-fill" style={{ width: `${health}%`, background: color }} />
    </div>
  );
}

export default function ProductOwnerView() {
  const [tab, setTab] = useState<SubTab>('overview');
  const [backlog, setBacklog] = useState<Backlog | null>(null);
  const [fairness, setFairness] = useState<Fairness | null>(null);
  const [refinements, setRefinements] = useState<Record<string, Refinement>>({});
  const [conflicts, setConflicts] = useState<ConflictResolution[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jira, setJira] = useState<JiraPoStatus | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [capacity, setCapacity] = useState(10);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [plan, setPlan] = useState<SprintPlan | null>(null);

  const reloadAll = () => {
    po.backlog().then(setBacklog).catch((e) => setError(String(e)));
    po.refinements().then(setRefinements).catch(() => undefined);
    po.conflicts().then(setConflicts).catch(() => undefined);
    po.jiraStatus().then(setJira).catch(() => undefined);
  };

  useEffect(() => {
    reloadAll();
    po.fairness().then(setFairness).catch(() => undefined);
  }, []);

  const syncJira = async () => {
    setSyncing(true);
    setSyncMsg('Syncing from Jira…');
    try {
      const r = await po.jiraSync();
      setSyncMsg(`Synced ${r.synced} issues from Jira (JQL: ${r.jql})`);
      setSelected([]);
      reloadAll();
    } catch (e) {
      setSyncMsg(String(e));
    } finally {
      setSyncing(false);
    }
  };

  const resetSample = async () => {
    setSyncing(true);
    try {
      await po.jiraReset();
      setSyncMsg('Reset to the built-in sample backlog');
      setSelected([]);
      reloadAll();
    } finally {
      setSyncing(false);
    }
  };

  // Re-derive capacity-dependent views when capacity changes OR the backlog
  // source changes (sync / reset), keyed on source+syncedAt.
  const backlogKey = `${backlog?.source ?? ''}:${backlog?.syncedAt ?? ''}`;
  useEffect(() => {
    po.roadmap(capacity).then(setRoadmap).catch(() => undefined);
    po.scenarios(capacity).then(setScenarios).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacity, backlogKey]);

  useEffect(() => {
    po.sprint(selected, capacity).then(setPlan).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, capacity, backlogKey]);

  const stories = backlog?.stories ?? [];
  const outcomes = backlog?.outcomes ?? [];

  return (
    <section className="panel">
      <h2>Product Owner — Backlog Intelligence Hub</h2>
      <p className="hint">
        Financial Sales Cloud in an FCA-regulated environment. INVEST health × RICE prioritisation, sprint
        readiness, dependency-aware roadmap forecasting, stakeholder conflict resolution and fairness — every
        recommendation shows its working.
      </p>
      {error && <p role="alert" className="badge bad">{error}</p>}

      <div className="legend" style={{ alignItems: 'center' }}>
        {backlog?.source === 'jira' ? (
          <span className="badge ok">Synced from Jira · {backlog.stories.length} stories{backlog.syncedAt ? ` · ${new Date(backlog.syncedAt).toLocaleString()}` : ''}</span>
        ) : (
          <span className="badge muted">Sample backlog (Financial Sales Cloud)</span>
        )}
        {jira?.configured ? (
          <button className="action" onClick={syncJira} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync from Jira'}
          </button>
        ) : (
          <span className="hint">Jira sync not configured — {jira?.hint ?? 'set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN (and optionally JIRA_PO_JQL)'}</span>
        )}
        {backlog?.source === 'jira' && (
          <button className="action" onClick={resetSample} disabled={syncing}>Reset to sample</button>
        )}
        {syncMsg && <span className="hint" role="status">{syncMsg}</span>}
      </div>

      <nav className="subtabs" role="tablist" aria-label="Product Owner views">
        {SUBTABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {!backlog ? (
        <p className="hint">Loading backlog…</p>
      ) : (
        <>
          {tab === 'overview' && <Overview backlog={backlog} roadmap={roadmap} />}
          {tab === 'stories' && <Stories stories={stories} />}
          {tab === 'heatmap' && <Heatmap stories={stories} />}
          {tab === 'sprint' && (
            <SprintBuilder stories={stories} selected={selected} setSelected={setSelected} plan={plan} capacity={capacity} setCapacity={setCapacity} />
          )}
          {tab === 'scenarios' && (
            <Scenarios scenarios={scenarios} onLoad={(ids) => { setSelected(ids); setTab('sprint'); }} />
          )}
          {tab === 'roadmap' && <RoadmapView roadmap={roadmap} capacity={capacity} setCapacity={setCapacity} outcomes={outcomes} />}
          {tab === 'dor' && <DorGate stories={stories} />}
          {tab === 'deps' && <Dependencies stories={stories} />}
          {tab === 'tension' && <Tension backlog={backlog} stories={stories} />}
          {tab === 'outcomes' && <OutcomeMap stories={stories} outcomes={outcomes} />}
          {tab === 'fairness' && <FairnessView fairness={fairness} />}
          {tab === 'refine' && <Refine stories={stories} refinements={refinements} />}
          {tab === 'conflicts' && <Conflicts conflicts={conflicts} />}
        </>
      )}
    </section>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────
function Overview({ backlog, roadmap }: { backlog: Backlog; roadmap: Roadmap | null }) {
  const s = backlog.summary;
  const kpis = [
    ['Total stories', s.total],
    ['Sprint Ready', s.ready],
    ['Needs Refinement', s.refine],
    ['Avg INVEST health', `${s.avgHealth}%`],
    ['DoR ready (≥4/5)', s.dorReady],
    ['FCA-regulated', s.regulatedCount],
    ['Avg conflict', `${s.avgConflict}%`],
    ['Top RICE', s.topRice.toLocaleString()],
  ] as const;
  return (
    <div>
      <div className="kpis">
        {kpis.map(([lbl, num]) => (
          <div className="kpi" key={lbl}><div className="num">{num}</div><div className="lbl">{lbl}</div></div>
        ))}
      </div>
      <h3>Outcome coverage</h3>
      <table>
        <thead><tr><th scope="col">Business outcome</th><th scope="col">Current → target</th><th scope="col">Stories</th></tr></thead>
        <tbody>
          {backlog.outcomes.map((o) => (
            <tr key={o.id}>
              <td><span className="badge" style={{ color: o.color }}>{o.label}</span></td>
              <td className="hint">{o.current} → {o.target} ({o.unit})</td>
              <td>{s.outcomeCoverage[o.id] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {roadmap && <p className="hint" style={{ marginTop: '0.6rem' }}>{roadmap.deliverySummary}</p>}
    </div>
  );
}

// ── Stories (TPO view) ──────────────────────────────────────────────────────
function Stories({ stories }: { stories: ScoredStory[] }) {
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'priority' | 'health' | 'rice'>('priority');

  const filtered = useMemo(() => {
    let list = stories.filter((s) =>
      (status === 'all' || s.status === status) &&
      (type === 'all' || s.storyType === type) &&
      (q === '' || (s.title + s.id + s.epic).toLowerCase().includes(q.toLowerCase())),
    );
    const key = sort === 'priority' ? 'priority' : sort === 'health' ? 'health' : 'riceScore';
    list = [...list].sort((a, b) => (b[key] as number) - (a[key] as number));
    return list;
  }, [stories, status, type, q, sort]);

  return (
    <div>
      <div className="legend">
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ font: 'inherit', padding: '0.25rem 0.4rem' }} aria-label="Search stories" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ font: 'inherit' }} aria-label="Filter by status">
          <option value="all">All statuses</option><option>Sprint Ready</option><option>Needs Refinement</option><option>Blocked</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ font: 'inherit' }} aria-label="Filter by type">
          <option value="all">All types</option><option>FIX</option><option>BUILD</option><option>COMPLY</option><option>ENHANCE</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} style={{ font: 'inherit' }} aria-label="Sort by">
          <option value="priority">Sort: Priority</option><option value="health">Sort: Health</option><option value="rice">Sort: RICE</option>
        </select>
        <span>{filtered.length} of {stories.length}</span>
      </div>
      <div className="cards">
        {filtered.map((s) => (
          <article className="story-card" key={s.id} style={{ borderLeftColor: s.statusColor }}>
            <h4>{s.title}</h4>
            <div className="meta">{s.id} · {s.epic} · effort {s.effort}wk</div>
            <InvestDots invest={s.invest} />
            <HealthBar health={s.health} />
            <div className="meta">Health {s.health}% · RICE {s.riceScore.toLocaleString()} · Priority #{s.rank}</div>
            <div className="chips">
              <span className="badge" style={{ color: TYPE_COLORS[s.storyType] }}>{s.storyType}</span>
              <span className={`badge ${statusBadge(s.status)}`}>{s.status}</span>
              {s.regulated && <span className="badge bad">FCA-regulated</span>}
              {s.dependencies.length > 0 && <span className="badge muted">deps: {s.dependencies.join(', ')}</span>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// ── Risk Heatmap (effort vs RICE scatter) ──────────────────────────────────
function Heatmap({ stories }: { stories: ScoredStory[] }) {
  const W = 640, H = 380, pad = 50;
  const maxEffort = Math.max(...stories.map((s) => s.effort));
  const maxRice = Math.max(...stories.map((s) => s.riceScore));
  const logRice = (r: number) => Math.log10(r + 1) / Math.log10(maxRice + 1);
  const x = (effort: number) => pad + (effort / maxEffort) * (W - 2 * pad);
  const y = (rice: number) => H - pad - logRice(rice) * (H - 2 * pad);
  const midX = pad + (W - 2 * pad) / 2;
  const midY = pad + (H - 2 * pad) / 2;

  return (
    <div>
      <p className="hint">X = effort (weeks) · Y = RICE priority (log). Quadrants: low effort/high value = Quick Win, high effort/high value = Big Bet, low effort/low value = Fill-in, high effort/low value = Defer.</p>
      <div className="svgwrap">
        <svg width={W} height={H} role="img" aria-label="Risk heatmap of stories by effort and RICE">
          <rect x={pad} y={pad} width={midX - pad} height={midY - pad} fill="#1E6B4A11" />
          <rect x={midX} y={pad} width={W - pad - midX} height={midY - pad} fill="#1F386411" />
          <rect x={pad} y={midY} width={midX - pad} height={H - pad - midY} fill="#00709B0d" />
          <rect x={midX} y={midY} width={W - pad - midX} height={H - pad - midY} fill="#8B1A1a0d" />
          <text x={pad + 8} y={pad + 16} fontSize="11" fill="#1E6B4A" fontWeight="700">QUICK WIN</text>
          <text x={midX + 8} y={pad + 16} fontSize="11" fill="#1F3864" fontWeight="700">BIG BET</text>
          <text x={pad + 8} y={H - pad - 8} fontSize="11" fill="#00709B" fontWeight="700">FILL-IN</text>
          <text x={midX + 8} y={H - pad - 8} fontSize="11" fill="#8B1A1A" fontWeight="700">DEFER</text>
          <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#ccc" />
          <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#ccc" />
          <text x={W / 2} y={H - 14} fontSize="11" textAnchor="middle" fill="#888">Effort (weeks) →</text>
          <text x={16} y={H / 2} fontSize="11" textAnchor="middle" fill="#888" transform={`rotate(-90 16 ${H / 2})`}>RICE priority →</text>
          {stories.map((s) => (
            <g key={s.id}>
              <circle cx={x(s.effort)} cy={y(s.riceScore)} r={8} fill={s.statusColor} opacity={0.85}>
                <title>{s.id} {s.title} — effort {s.effort}wk, RICE {s.riceScore.toLocaleString()}</title>
              </circle>
              <text x={x(s.effort)} y={y(s.riceScore) - 11} fontSize="9" textAnchor="middle" fill="#444">{s.id.replace('FSC-', '')}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ── Sprint Builder ──────────────────────────────────────────────────────────
function SprintBuilder({ stories, selected, setSelected, plan, capacity, setCapacity }: {
  stories: ScoredStory[]; selected: string[]; setSelected: (ids: string[]) => void;
  plan: SprintPlan | null; capacity: number; setCapacity: (n: number) => void;
}) {
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const pct = plan ? Math.min(100, (plan.totalEffort / capacity) * 100) : 0;
  return (
    <div>
      <label className="row">Sprint capacity (weeks)
        <input type="number" min={1} max={40} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
      </label>
      {plan && (
        <>
          <div className="healthbar-bg" style={{ height: 14 }}>
            <div className="healthbar-fill" style={{ height: 14, width: `${pct}%`, background: plan.overCapacity ? '#8B1A1A' : '#1E6B4A' }} />
          </div>
          <p className="meta">{plan.totalEffort} / {capacity} weeks selected · avg health {plan.avgHealth}% · outcomes: {plan.outcomesCovered.join(', ') || '—'}</p>
          {plan.warnings.map((w, i) => <p key={i} role="alert" className="badge warn" style={{ display: 'block', marginBottom: 4 }}>{w}</p>)}
        </>
      )}
      <table>
        <thead><tr><th scope="col">Add</th><th scope="col">Story</th><th scope="col">Type</th><th scope="col">Effort</th><th scope="col">Health</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {stories.map((s) => (
            <tr key={s.id}>
              <td><input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} aria-label={`Add ${s.title}`} /></td>
              <td>{s.id} {s.title}</td>
              <td><span className="badge" style={{ color: TYPE_COLORS[s.storyType] }}>{s.storyType}</span></td>
              <td>{s.effort}wk</td>
              <td>{s.health}%</td>
              <td><span className={`badge ${statusBadge(s.status)}`}>{s.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Scenario Planner ────────────────────────────────────────────────────────
function Scenarios({ scenarios, onLoad }: { scenarios: Scenario[]; onLoad: (ids: string[]) => void }) {
  return (
    <div className="cards">
      {scenarios.map((sc) => (
        <article className="story-card" key={sc.key} style={{ borderLeftColor: '#1F3864' }}>
          <h4>{sc.label}</h4>
          <p className="hint">{sc.description}</p>
          <div className="meta">{sc.totalEffort}wk · avg health {sc.avgHealth}% · avg conflict {sc.avgConflict}% · outcomes {sc.outcomesCovered.length}</div>
          <ul className="reasons">
            {sc.stories.map((s) => <li key={s.id}>{s.id} {s.title} <span className="badge" style={{ color: TYPE_COLORS[s.type] }}>{s.type}</span> {s.effort}wk</li>)}
          </ul>
          <button className="action" style={{ marginTop: '0.5rem' }} onClick={() => onLoad(sc.stories.map((s) => s.id))}>Load into Sprint Builder</button>
        </article>
      ))}
    </div>
  );
}

// ── Roadmap Forecaster ──────────────────────────────────────────────────────
function RoadmapView({ roadmap, capacity, setCapacity, outcomes }: {
  roadmap: Roadmap | null; capacity: number; setCapacity: (n: number) => void; outcomes: Backlog['outcomes'];
}) {
  if (!roadmap) return <p className="hint">Computing roadmap…</p>;
  return (
    <div>
      <label className="row">Sprint capacity (weeks)
        <input type="number" min={1} max={40} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
      </label>
      <p className="hint">{roadmap.deliverySummary}</p>
      {roadmap.sprints.map((sp) => (
        <div className="panel" key={sp.sprint} style={{ marginBottom: '0.6rem' }}>
          <h4>Sprint {sp.sprint} <span className="badge muted">{sp.effort}/{sp.capacity} wk</span></h4>
          <table>
            <thead><tr><th scope="col">Story</th><th scope="col">Epic</th><th scope="col">Effort</th><th scope="col">Outcome</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {sp.stories.map((s) => (
                <tr key={s.id}>
                  <td>{s.id} {s.title}</td>
                  <td className="hint">{s.epic}</td>
                  <td>{s.effort}wk</td>
                  <td>{outcomes.find((o) => o.id === s.outcome)?.label ?? s.outcome}</td>
                  <td><span className="badge" style={{ color: s.color }}>{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <h3>Outcome delivery sprint</h3>
      <ul className="reasons">
        {Object.entries(roadmap.outcomeSprints).map(([oid, sprint]) => (
          <li key={oid}>{outcomes.find((o) => o.id === oid)?.label ?? oid}: delivered by Sprint {sprint}</li>
        ))}
      </ul>
    </div>
  );
}

// ── DoR Gate ────────────────────────────────────────────────────────────────
function DorGate({ stories }: { stories: ScoredStory[] }) {
  const labels: Record<string, string> = {
    has_user_story: 'User story format', has_3_ac: '≥3 acceptance criteria',
    compliance_assessed: 'Compliance assessed', health_ready: 'INVEST health ≥70%', dependencies_clear: 'Dependencies clear',
  };
  return (
    <table>
      <thead><tr><th scope="col">Story</th>{Object.values(labels).map((l) => <th scope="col" key={l}>{l}</th>)}<th scope="col">Gate</th></tr></thead>
      <tbody>
        {stories.map((s) => (
          <tr key={s.id}>
            <td>{s.id} {s.title}</td>
            {Object.keys(labels).map((k) => (
              <td key={k}>{s.dorChecks[k] ? <span className="badge ok">✓</span> : <span className="badge bad">✗</span>}</td>
            ))}
            <td><span className="badge" style={{ color: s.dorColor }}>{s.dorScore}/5 {s.dorStatus}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Dependencies (layered node-link graph) ─────────────────────────────────
function Dependencies({ stories }: { stories: ScoredStory[] }) {
  const map = new Map(stories.map((s) => [s.id, s]));
  const depthCache = new Map<string, number>();
  const depth = (id: string, seen = new Set<string>()): number => {
    if (depthCache.has(id)) return depthCache.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const s = map.get(id);
    const deps = s ? s.dependencies.filter((d) => map.has(d)) : [];
    const d = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((x) => depth(x, seen)));
    depthCache.set(id, d);
    return d;
  };
  const layers: ScoredStory[][] = [];
  for (const s of stories) {
    const d = depth(s.id);
    (layers[d] ??= []).push(s);
  }
  const colW = 200, rowH = 56, W = Math.max(640, layers.length * colW + 40), H = Math.max(...layers.map((l) => l.length)) * rowH + 40;
  const pos = new Map<string, { x: number; y: number }>();
  layers.forEach((layer, li) => layer.forEach((s, si) => pos.set(s.id, { x: 30 + li * colW, y: 30 + si * rowH })));

  return (
    <div>
      <p className="hint">Stories arranged by dependency depth (left = no dependencies). Arrows point from a dependency to the story that needs it.</p>
      <div className="svgwrap">
        <svg width={W} height={H} role="img" aria-label="Dependency graph">
          <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#888" /></marker></defs>
          {stories.flatMap((s) => s.dependencies.filter((d) => pos.has(d)).map((d) => {
            const from = pos.get(d)!, to = pos.get(s.id)!;
            return <line key={`${d}-${s.id}`} x1={from.x + 150} y1={from.y + 16} x2={to.x} y2={to.y + 16} stroke="#bbb" markerEnd="url(#arrow)" />;
          }))}
          {stories.map((s) => {
            const p = pos.get(s.id)!;
            return (
              <g key={s.id}>
                <rect x={p.x} y={p.y} width={150} height={32} rx={5} fill="#fff" stroke={s.statusColor} strokeWidth={2} />
                <text x={p.x + 8} y={p.y + 20} fontSize="11" fill="#1f2430">{s.id} {s.title.slice(0, 16)}</text>
                <title>{s.title}</title>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── Tension Board ───────────────────────────────────────────────────────────
function Tension({ backlog, stories }: { backlog: Backlog; stories: ScoredStory[] }) {
  const s = backlog.summary;
  const total = s.total;
  const seg = [
    ['FIX', s.fixCount, '#1F3864'], ['BUILD', s.buildCount, '#1E6B4A'],
    ['COMPLY', s.complyCount, '#C55A11'], ['ENHANCE', s.enhanceCount, '#5C277F'],
  ] as const;
  const topConflict = [...stories].sort((a, b) => b.conflictIdx - a.conflictIdx).slice(0, 3);
  return (
    <div>
      <h3>Fix : Build : Comply : Enhance composition</h3>
      <div className="composition">
        {seg.map(([label, n, color]) => n > 0 && (
          <div key={label} style={{ width: `${(n / total) * 100}%`, background: color }}>{label} {n}</div>
        ))}
      </div>
      <p className="hint" style={{ marginTop: '0.5rem' }}>Average stakeholder conflict across the backlog: {s.avgConflict}%</p>
      <h3>Conflict spotlight (highest disagreement)</h3>
      <table>
        <thead><tr><th scope="col">Story</th><th scope="col">Type</th><th scope="col">Ops / Lead / Eng votes</th><th scope="col">Conflict</th></tr></thead>
        <tbody>
          {topConflict.map((st) => (
            <tr key={st.id}>
              <td>{st.id} {st.title}</td>
              <td><span className="badge" style={{ color: TYPE_COLORS[st.storyType] }}>{st.storyType}</span></td>
              <td>{st.votes.ops} / {st.votes.leadership} / {st.votes.engineering}</td>
              <td><span className={`badge ${st.conflictIdx > 60 ? 'bad' : st.conflictIdx > 30 ? 'warn' : 'ok'}`}>{st.conflictIdx}%</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Outcome Map ─────────────────────────────────────────────────────────────
function OutcomeMap({ stories, outcomes }: { stories: ScoredStory[]; outcomes: Backlog['outcomes'] }) {
  return (
    <div className="cards">
      {outcomes.map((o) => {
        const linked = stories.filter((s) => s.outcome === o.id);
        return (
          <article className="story-card" key={o.id} style={{ borderLeftColor: o.color }}>
            <h4 style={{ color: o.color }}>{o.label}</h4>
            <div className="meta">{o.current} → {o.target} · {o.unit}</div>
            <div className="meta">{linked.length} stor{linked.length === 1 ? 'y' : 'ies'} contributing</div>
            <div className="chips">
              {linked.map((s) => <span key={s.id} className="badge" style={{ color: s.statusColor }} title={s.title}>{s.id}</span>)}
              {linked.length === 0 && <span className="badge warn">No stories — coverage gap</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ── Stakeholder Fairness ────────────────────────────────────────────────────
function FairnessView({ fairness }: { fairness: Fairness | null }) {
  if (!fairness) return <p className="hint">Loading fairness…</p>;
  const groups = Object.entries(fairness.groups);
  const allGroups = ['ops', 'leadership', 'engineering', 'compliance'];
  return (
    <div>
      <h3>Stakeholder attention (share of last 5 sprints)</h3>
      <div className="legend" style={{ gap: '1.5rem' }}>
        {groups.map(([g, pct]) => {
          const r = 28, c = 2 * Math.PI * r;
          return (
            <div key={g} style={{ textAlign: 'center' }}>
              <svg width={72} height={72}>
                <circle cx={36} cy={36} r={r} fill="none" stroke="#e7e2d8" strokeWidth={8} />
                <circle cx={36} cy={36} r={r} fill="none" stroke={pct >= 50 ? '#1E6B4A' : '#C55A11'} strokeWidth={8}
                  strokeDasharray={`${(pct / 100) * c} ${c}`} strokeLinecap="round" transform="rotate(-90 36 36)" />
                <text x={36} y={40} textAnchor="middle" fontSize="14" fontWeight="700">{pct}%</text>
              </svg>
              <div className="ring-label">{g}</div>
            </div>
          );
        })}
      </div>
      <h3>Sprint history heatmap</h3>
      <table>
        <thead><tr><th scope="col">Sprint</th>{allGroups.map((g) => <th scope="col" key={g}>{g}</th>)}</tr></thead>
        <tbody>
          {Object.entries(fairness.history).map(([sprint, served]) => (
            <tr key={sprint}>
              <td>Sprint {sprint}</td>
              {allGroups.map((g) => (
                <td key={g}><span className="heat-cell" style={{ background: served.includes(g) ? '#1E6B4A' : '#e7e2d8' }} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: '0.6rem' }} role="status">{fairness.recommendation}</p>
    </div>
  );
}

// ── Story Refinement ────────────────────────────────────────────────────────
function Refine({ stories, refinements }: { stories: ScoredStory[]; refinements: Record<string, Refinement> }) {
  const [filter, setFilter] = useState<'all' | 'decompose' | 'ready'>('all');
  const list = stories.filter((s) => {
    const r = refinements[s.id];
    if (!r) return false;
    if (filter === 'decompose') return r.shouldDecompose;
    if (filter === 'ready') return !r.shouldDecompose;
    return true;
  });
  return (
    <div>
      <div className="legend">
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ font: 'inherit' }} aria-label="Filter refinement">
          <option value="all">All stories</option><option value="decompose">Needs decomposition</option><option value="ready">Sprint ready</option>
        </select>
      </div>
      {list.map((s) => {
        const r = refinements[s.id]!;
        return (
          <div className="panel" key={s.id} style={{ marginBottom: '0.6rem' }}>
            <h4>{s.id} {s.title} {r.shouldDecompose ? <span className="badge bad">Decompose ({r.subStories.length} sub-stories)</span> : <span className="badge ok">Sprint ready</span>}</h4>
            <p className="hint">{r.reason}</p>
            {r.subStories.length > 0 && (
              <table>
                <thead><tr><th scope="col">Sub-story</th><th scope="col">Effort</th><th scope="col">Priority</th><th scope="col">Rationale</th></tr></thead>
                <tbody>
                  {r.subStories.map((ss, i) => (
                    <tr key={i}><td>{ss.title}<div className="hint">{ss.userStory}</div></td><td>{ss.effortWeeks}wk</td><td>{ss.priority}</td><td className="hint">{ss.rationale}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="grid2" style={{ marginTop: '0.5rem' }}>
              <div><strong>Hidden risks</strong><ul className="reasons">{r.hiddenRisks.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              <div><strong>Missing elements</strong><ul className="reasons">{r.missingElements.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            </div>
            <p className="hint" style={{ marginTop: '0.4rem' }}><strong>Advice:</strong> {r.refinementAdvice}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Conflict Resolver ───────────────────────────────────────────────────────
function Conflicts({ conflicts }: { conflicts: ConflictResolution[] }) {
  return (
    <div>
      <p className="hint">High-conflict stories with each stakeholder's position, two resolution options, and a recommended path.</p>
      {conflicts.length === 0 && (
        <p className="hint">No authored conflict resolutions for the current backlog. These are hand-authored for the sample backlog; for Jira-synced stories, use the Tension Board to see computed stakeholder conflict, or generate resolutions with the AI layer.</p>
      )}
      {conflicts.map((c) => (
        <div className="panel" key={c.storyId} style={{ marginBottom: '0.7rem' }}>
          <h4>{c.storyId} {c.title} <span className="badge bad">{c.conflictIdx}% conflict</span></h4>
          <p><strong>Core tension:</strong> {c.coreTension}</p>
          <ul className="reasons">
            <li><strong>Sales/Ops:</strong> {c.opsPosition}</li>
            <li><strong>Leadership:</strong> {c.leadershipPosition}</li>
            <li><strong>Engineering:</strong> {c.engPosition}</li>
          </ul>
          <div className="grid2">
            {([['A', c.optionA], ['B', c.optionB]] as const).map(([key, opt]) => (
              <div className="panel" key={key} style={{ background: c.recommendedOption === key ? '#1E6B4A11' : undefined }}>
                <h4>Option {key}: {opt.label} {c.recommendedOption === key && <span className="badge ok">Recommended</span>}</h4>
                <ul className="reasons">
                  <li><strong>Ops:</strong> {opt.opsImpact}</li>
                  <li><strong>Leadership:</strong> {opt.leadershipImpact}</li>
                  <li><strong>Engineering:</strong> {opt.engImpact}</li>
                  <li><strong>Risk:</strong> {opt.risk}</li>
                </ul>
              </div>
            ))}
          </div>
          <p className="hint" style={{ marginTop: '0.4rem' }}><strong>Why Option {c.recommendedOption}:</strong> {c.recommendationReason}</p>
        </div>
      ))}
    </div>
  );
}
