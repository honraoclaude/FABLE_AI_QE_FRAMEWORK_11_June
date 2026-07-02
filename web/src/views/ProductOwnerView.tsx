import { useEffect, useMemo, useState } from 'react';
import {
  po,
  type Backlog,
  type ComplexityFinding,
  type ConflictResolution,
  type Fairness,
  type JiraPoStatus,
  type PredictionReport,
  type Refinement,
  type Roadmap,
  type Scenario,
  type ScoredStory,
  type SprintPlan,
  type Trends,
} from '../po-api';
import { Gauge, KpiCard, ProgressBar, Radar, trendSeries } from '../components/dashboard';
import { IconChart, IconFlag, IconFlask, IconLayers, IconShield, IconSpark, IconUsers } from '../icons';

const TYPE_COLORS: Record<string, string> = { FIX: '#1F3864', BUILD: '#1E6B4A', COMPLY: '#B5520F', ENHANCE: '#5C277F' };
const INVEST_LETTERS = ['I', 'N', 'V', 'E', 'S', 'T'] as const;
const investColor = (v: number) => (v >= 4 ? '#1E6B4A' : v >= 3 ? '#C55A11' : '#8B1A1A');
const statusBadge = (s: string) => (s === 'Sprint Ready' ? 'ok' : s === 'Needs Refinement' ? 'warn' : 'bad');

const SUBTABS = [
  ['overview', 'Overview'],
  ['copilot', 'Sprint Copilot'],
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
  ['accuracy', 'Prediction Accuracy'],
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
  const [trends, setTrends] = useState<Trends | null>(null);
  const [complexity, setComplexity] = useState<Record<string, ComplexityFinding>>({});

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
    po.trends().then(setTrends).catch(() => undefined);
    po.aiResults().then((r) => setComplexity(r.complexity)).catch(() => undefined);
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
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Product Owner</h2>
        <span className="hint">Backlog Intelligence Hub · Financial Sales Cloud (FCA-regulated)</span>
      </div>
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
          {tab === 'overview' && <Overview backlog={backlog} roadmap={roadmap} trends={trends} />}
          {tab === 'copilot' && <Copilot />}
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
          {tab === 'refine' && (
            <Refine stories={stories} refinements={refinements} complexity={complexity} source={backlog.source} onChanged={reloadAll} />
          )}
          {tab === 'conflicts' && (
            <Conflicts conflicts={conflicts} stories={stories} source={backlog.source} onChanged={reloadAll} />
          )}
          {tab === 'accuracy' && <PredictionAccuracy />}
        </>
      )}
    </section>
  );
}

// ── Overview (executive dashboard) ──────────────────────────────────────────
function Overview({ backlog, roadmap, trends }: { backlog: Backlog; roadmap: Roadmap | null; trends: Trends | null }) {
  const s = backlog.summary;
  const hasHistory = (trends?.points.length ?? 0) >= 2;

  /** Real snapshot series + delta when history exists; indicative otherwise. */
  const kpiTrend = (
    key: keyof Trends['points'][number],
    fallback: number,
    unit = '',
  ): { series: number[]; trend: { dir: 'up' | 'down' | 'flat'; text: string } } => {
    if (hasHistory && trends) {
      const series = trends.points.map((p) => Number(p[key]));
      const delta = trends.deltas?.[key as string] ?? 0;
      return {
        series,
        trend: {
          dir: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
          text: delta === 0 ? 'no change' : `${delta > 0 ? '+' : ''}${delta}${unit} vs last snapshot`,
        },
      };
    }
    return { series: trendSeries(fallback), trend: { dir: 'flat', text: 'no history yet' } };
  };
  const stories = backlog.stories;
  const dims = ['I', 'N', 'V', 'E', 'S', 'T'] as const;
  const radarVals = dims.map((d) => stories.reduce((sum, st) => sum + st.invest[d], 0) / stories.length);
  const totalRice = stories.reduce((sum, st) => sum + st.riceScore, 0);
  const readinessPct = Math.round((s.ready / s.total) * 100);
  const alignment = 100 - s.avgConflict;
  const regulated = stories.filter((st) => st.regulated);
  const regReady = regulated.filter((st) => st.status === 'Sprint Ready').length;
  const compliancePct = regulated.length ? Math.round((regReady / regulated.length) * 100) : 100;

  // critical dependencies = stories that the most other stories depend on
  const inDegree = new Map<string, number>();
  stories.forEach((st) => st.dependencies.forEach((d) => inDegree.set(d, (inDegree.get(d) ?? 0) + 1)));
  const critical = [...inDegree.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id, n]) => ({ id, n, title: stories.find((x) => x.id === id)?.title ?? id }));
  const blocked = stories.filter((st) => st.status === 'Blocked');
  const regConcerns = regulated.filter((st) => st.status !== 'Sprint Ready');

  const maxCov = Math.max(1, ...backlog.outcomes.map((o) => s.outcomeCoverage[o.id] ?? 0));

  const heroBadge = (lbl: string, val: string, dotColor?: string) => (
    <div className="status-badge"><div className="lbl">{lbl}</div><div className="val">{dotColor && <span style={{ width: 8, height: 8, borderRadius: 4, background: dotColor }} />}{val}</div></div>
  );

  return (
    <div>
      {/* Hero */}
      <div className="hero">
        <h2>Product Owner Intelligence Hub</h2>
        <p>Backlog health, sprint readiness, dependency insights and outcome forecasting — in one executive view.</p>
        <div className="status-badges">
          {heroBadge('Current Sprint', 'Sprint 6 · Q2 FY25')}
          {heroBadge('Release Target', roadmap ? `Sprint ${roadmap.sprints.length}` : '—')}
          {heroBadge('FCA Compliance', `${compliancePct}% ready`, compliancePct >= 75 ? '#10b981' : compliancePct >= 50 ? '#f59e0b' : '#ef4444')}
          {heroBadge('Team Readiness', `${readinessPct}%`, readinessPct >= 60 ? '#10b981' : '#f59e0b')}
        </div>
      </div>

      {/* KPI cards */}
      <div className="kpis">
        <KpiCard icon={IconLayers} tint="#4f46e5" label="Total Stories" value={s.total} {...kpiTrend('total', s.total)} context="in active backlog" />
        <KpiCard icon={IconFlag} tint="#10b981" label="Sprint Ready" value={s.ready} {...kpiTrend('ready', s.ready)} context={`${readinessPct}% of backlog`} />
        <KpiCard icon={IconFlask} tint="#f59e0b" label="Needs Refinement" value={s.refine} {...kpiTrend('refine', s.refine)} context="in refinement queue" />
        <KpiCard icon={IconChart} tint="#4f46e5" label="INVEST Health" value={`${s.avgHealth}%`} {...kpiTrend('avgHealth', s.avgHealth, '%')} context="avg story quality" />
        <KpiCard icon={IconShield} tint="#10b981" label="DoR Readiness" value={`${Math.round((s.dorReady / s.total) * 100)}%`} {...kpiTrend('dorReady', s.dorReady)} context={`${s.dorReady}/${s.total} pass the gate`} />
        <KpiCard icon={IconShield} tint="#ef4444" label="FCA-Regulated" value={s.regulatedCount} {...kpiTrend('regulatedCount', s.regulatedCount)} context="require compliance sign-off" />
        <KpiCard icon={IconUsers} tint="#f59e0b" label="Conflict Index" value={`${s.avgConflict}%`} {...kpiTrend('avgConflict', s.avgConflict, '%')} context="avg stakeholder disagreement" />
        <KpiCard icon={IconSpark} tint="#4f46e5" label="Total RICE Value" value={totalRice.toLocaleString()} {...kpiTrend('totalRice', totalRice / 1000)} context="weighted backlog value" />
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        {hasHistory && trends
          ? `Trends computed from ${trends.points.length} sprint snapshots (since ${new Date(trends.points[0]!.takenAt).toLocaleDateString()}). Snapshots record on every Jira sync.`
          : 'Trends are indicative until at least 2 sprint snapshots exist — snapshots record on server start and every Jira sync.'}
      </p>

      {/* Gauges */}
      <div className="grid3" style={{ marginTop: 16 }}>
        <div className="panel" style={{ display: 'flex', justifyContent: 'center' }}>
          <Gauge value={readinessPct} label="Sprint Readiness" sub={`${s.ready}/${s.total} ready`} color="#10b981" />
        </div>
        <div className="panel" style={{ display: 'flex', justifyContent: 'center' }}>
          <Gauge value={alignment} label="Stakeholder Alignment" sub={`${s.avgConflict}% conflict`} color="#4f46e5" />
        </div>
        <div className="panel" style={{ display: 'flex', justifyContent: 'center' }}>
          <Gauge value={compliancePct} label="FCA Compliance Readiness" sub={`${regReady}/${regulated.length} regulated ready`} color={compliancePct >= 75 ? '#10b981' : '#f59e0b'} />
        </div>
      </div>

      {/* 3-column: backlog health · outcome coverage · risk & dependency */}
      <div className="grid3" style={{ marginTop: 0 }}>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Backlog Health</h3>
          <div style={{ display: 'flex', justifyContent: 'center' }}><Radar axes={[...dims]} values={radarVals} /></div>
          <h4>Story quality distribution</h4>
          <div className="composition">
            {([['Ready', s.ready, '#047857'], ['Refine', s.refine, '#b45309'], ['Blocked', s.blocked, '#b91c1c']] as const).map(([l, n, c]) => n > 0 && (
              <div key={l} style={{ width: `${(n / s.total) * 100}%`, background: c }}>{l} {n}</div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Outcome Coverage</h3>
          {backlog.outcomes.map((o) => (
            <ProgressBar key={o.id} label={o.label} current={o.current} target={o.target} pct={((s.outcomeCoverage[o.id] ?? 0) / maxCov) * 100} color={o.color} />
          ))}
          {roadmap && <p className="hint" style={{ marginTop: 10 }}>{roadmap.deliverySummary}</p>}
        </div>

        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Risk &amp; Dependency</h3>
          <h4>Blocked stories</h4>
          {blocked.length ? blocked.map((st) => <div key={st.id}><span className="badge bad">{st.id}</span> {st.title}</div>) : <p className="hint">None blocked.</p>}
          <h4>Critical dependencies</h4>
          {critical.length ? (
            <ul className="reasons">{critical.map((c) => <li key={c.id}><strong>{c.id}</strong> blocks {c.n} stor{c.n === 1 ? 'y' : 'ies'} — {c.title}</li>)}</ul>
          ) : <p className="hint">No shared dependencies.</p>}
          <h4>Regulatory concerns</h4>
          {regConcerns.length ? (
            <div className="chips">{regConcerns.map((st) => <span key={st.id} className="badge warn" title={st.title}>{st.id} · {st.status}</span>)}</div>
          ) : <p className="hint">All FCA-regulated stories are sprint-ready.</p>}
        </div>
      </div>

      {/* Prioritization matrix */}
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Story Prioritization Matrix</h3>
        <Heatmap stories={stories} />
      </div>
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
      <Gantt roadmap={roadmap} />
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

// ── Roadmap Gantt (quarterly bands) ─────────────────────────────────────────
function Gantt({ roadmap }: { roadmap: Roadmap }) {
  const rows = roadmap.sprints.flatMap((sp) => sp.stories.map((s) => ({ ...s, sprint: sp.sprint })));
  const sprints = roadmap.sprints.length;
  const colW = 84, rowH = 26, labelW = 210;
  const W = labelW + sprints * colW + 20;
  const H = rows.length * rowH + 58;
  const SPRINTS_PER_QUARTER = 6; // ~2-week sprints → 6 per quarter

  return (
    <div className="svgwrap panel" style={{ padding: 12 }} tabIndex={0} aria-label="Roadmap Gantt chart">
      <svg width={W} height={H} role="img" aria-label="Story schedule across sprints with quarter bands">
        {/* quarter bands */}
        {Array.from({ length: Math.ceil(sprints / SPRINTS_PER_QUARTER) }, (_, q) => (
          <g key={q}>
            <rect
              x={labelW + q * SPRINTS_PER_QUARTER * colW} y={0}
              width={Math.min(SPRINTS_PER_QUARTER, sprints - q * SPRINTS_PER_QUARTER) * colW} height={H}
              fill={q % 2 === 0 ? 'transparent' : 'var(--surface-2)'} opacity={0.5}
            />
            <text x={labelW + q * SPRINTS_PER_QUARTER * colW + 6} y={16} fontSize="11" fontWeight={700} fill="var(--muted)">Q{q + 1}</text>
          </g>
        ))}
        {/* sprint columns */}
        {roadmap.sprints.map((sp, i) => (
          <text key={sp.sprint} x={labelW + i * colW + colW / 2} y={34} fontSize="10.5" textAnchor="middle" fill="var(--muted)">
            S{sp.sprint} · {sp.effort}w
          </text>
        ))}
        {/* rows */}
        {rows.map((s, i) => {
          const y = 46 + i * rowH;
          const x = labelW + (s.sprint - 1) * colW;
          const w = Math.max(20, Math.min(colW * 2, (s.effort / 10) * colW * 2));
          return (
            <g key={s.id}>
              <text x={4} y={y + 13} fontSize="11" fill="var(--ink-strong)">{s.id} {s.title.slice(0, 24)}</text>
              <rect x={x + 4} y={y + 2} width={w} height={rowH - 8} rx={5} fill={s.color} opacity={0.9}>
                <title>{s.id} {s.title} — Sprint {s.sprint}, {s.effort}wk, {s.status}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Prediction Accuracy (§15) ───────────────────────────────────────────────
function PredictionAccuracy() {
  const [report, setReport] = useState<PredictionReport | null>(null);

  useEffect(() => {
    po.predictionAccuracy().then(setReport).catch(() => undefined);
  }, []);

  if (!report) return <div className="skeleton" style={{ height: 200 }} />;

  return (
    <div>
      <p className="hint">
        Framework §15 continuous improvement: compares each story's first-seen prediction (INVEST health,
        readiness) against its latest snapshot and actual delivery, and suggests scoring recalibrations.
        {` ${report.snapshots} snapshot(s) over ${report.spanDays} day(s).`}
      </p>
      {report.note && <p className="badge warn" style={{ display: 'inline-block' }}>{report.note}</p>}

      {report.stories.length > 0 && (
        <>
          <div className="kpis" style={{ margin: '12px 0' }}>
            {([['Improved', report.summary.improved], ['Degraded', report.summary.degraded], ['Unchanged', report.summary.unchanged], ['Stuck in refinement', report.summary.stuckInRefinement], ['Avg health drift', `${report.summary.avgHealthDelta > 0 ? '+' : ''}${report.summary.avgHealthDelta}%`]] as const).map(([l, v]) => (
              <div className="kpi" key={l}><div className="num">{v}</div><div className="lbl">{l}</div></div>
            ))}
          </div>
          <div className="panel" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr><th scope="col">Story</th><th scope="col">Predicted (first seen)</th><th scope="col">Latest</th><th scope="col">Drift</th><th scope="col">Delivered</th></tr>
              </thead>
              <tbody>
                {report.stories.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id} {s.stuckInRefinement && <span className="badge warn">stuck</span>}</td>
                    <td className="hint">{s.initialHealth}% · {s.initialStatus}</td>
                    <td className="hint">{s.latestHealth}% · {s.latestStatus}</td>
                    <td><span className={`badge ${s.healthDelta > 0 ? 'ok' : s.healthDelta < 0 ? 'bad' : 'muted'}`}>{s.healthDelta > 0 ? '+' : ''}{s.healthDelta}%</span></td>
                    <td>{s.delivered === null ? <span className="badge muted">unknown</span> : s.delivered ? <span className="badge ok">yes</span> : <span className="badge muted">not yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3>Recalibration hints</h3>
      <ul className="reasons">
        {report.recalibrationHints.map((h, i) => <li key={i}>{h}</li>)}
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
function Refine({ stories, refinements, complexity, source, onChanged }: {
  stories: ScoredStory[];
  refinements: Record<string, Refinement>;
  complexity: Record<string, ComplexityFinding>;
  source: 'jira' | 'sample';
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'decompose' | 'ready'>('all');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [aiMsg, setAiMsg] = useState<Record<string, string>>({});

  const runAi = async (id: string, kind: 'decompose' | 'complexity') => {
    setBusy((b) => ({ ...b, [id]: true }));
    setAiMsg((m) => ({ ...m, [id]: `Running ${kind === 'decompose' ? 'AI decomposition' : 'hidden-complexity detection'}…` }));
    try {
      if (kind === 'decompose') await po.aiDecompose(id);
      else await po.aiComplexity(id);
      setAiMsg((m) => ({ ...m, [id]: '' }));
      onChanged();
    } catch (e) {
      setAiMsg((m) => ({ ...m, [id]: String(e) }));
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };
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
        const cx = complexity[s.id];
        return (
          <div className="panel" key={s.id} style={{ marginBottom: '0.6rem' }}>
            <h4>
              {s.id} {s.title}{' '}
              {r.shouldDecompose ? <span className="badge bad">Decompose ({r.subStories.length} sub-stories)</span> : <span className="badge ok">Sprint ready</span>}{' '}
              {cx && (
                <span className={`badge ${cx.complexityScore >= 7 ? 'bad' : cx.complexityScore >= 4 ? 'warn' : 'ok'}`} title={cx.reasoning}>
                  hidden complexity {cx.complexityScore}/10
                </span>
              )}
            </h4>
            <p className="hint">{r.reason}</p>
            {cx && cx.redFlags.length > 0 && (
              <div className="chips">{cx.redFlags.map((f, i) => <span key={i} className="badge warn">⚑ {f}</span>)}</div>
            )}
            {source === 'jira' && (
              <p>
                <button className="action ghost" onClick={() => runAi(s.id, 'decompose')} disabled={busy[s.id]}>
                  {busy[s.id] ? 'Working…' : 'Decompose with AI'}
                </button>{' '}
                <button className="action ghost" onClick={() => runAi(s.id, 'complexity')} disabled={busy[s.id]}>
                  Detect hidden complexity
                </button>
                {aiMsg[s.id] && <span className="hint" role="status"> {aiMsg[s.id]}</span>}
              </p>
            )}
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

// ── Sprint Copilot (agentic chat over the engines) ──────────────────────────
const COPILOT_SUGGESTIONS = [
  'What should we pull into the next sprint if capacity drops to 8 weeks?',
  'Why is the top-ranked story ranked #1?',
  'Compare the three sprint scenarios and recommend one',
  'Which stories put FCA compliance at risk right now?',
  'Is the backlog getting healthier over time?',
];

function Copilot() {
  const [messages, setMessages] = useState<import('../po-api').CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    setInput('');
    const history = [...messages, { role: 'user' as const, content: q }];
    setMessages(history);
    setBusy(true);
    try {
      const r = await po.copilot(history.map(({ role, content }) => ({ role, content })));
      setMessages([...history, { role: 'assistant', content: r.reply, toolTrace: r.toolTrace }]);
    } catch (e) {
      setError(String(e));
      setMessages(history);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{ maxWidth: 860 }}>
      <h3 style={{ marginTop: 0 }}>Sprint Copilot</h3>
      <p className="hint">
        Ask about the backlog in plain English. Every answer is computed by calling the same scoring, sprint,
        roadmap and scenario engines the dashboard uses — the tool calls are shown under each reply, so every
        number is traceable.
      </p>

      {messages.length === 0 && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {COPILOT_SUGGESTIONS.map((sg) => (
            <button key={sg} className="ghost action" style={{ fontWeight: 500 }} onClick={() => send(sg)} disabled={busy}>
              {sg}
            </button>
          ))}
        </div>
      )}

      <div aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} style={{ margin: '10px 0' }}>
            {m.role === 'user' ? (
              <div style={{ background: 'var(--info-bg)', color: 'var(--info-fg)', borderRadius: 12, padding: '10px 14px', marginLeft: 'auto', maxWidth: '85%', width: 'fit-content', fontWeight: 500 }}>
                {m.content}
              </div>
            ) : (
              <div style={{ background: 'var(--slate-50)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', maxWidth: '95%', whiteSpace: 'pre-wrap' }}>
                {m.content}
                {m.toolTrace && m.toolTrace.length > 0 && (
                  <div className="chips" style={{ marginTop: 10 }}>
                    {m.toolTrace.map((t, j) => (
                      <span key={j} className="badge muted" title={JSON.stringify(t.input)}>
                        ⚙ {t.tool}{Object.keys(t.input).length > 0 ? `(${Object.entries(t.input).map(([k, v]) => `${k}=${Array.isArray(v) ? `[${v.length}]` : String(v)}`).join(', ')})` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="skeleton" style={{ height: 44, maxWidth: '60%' }} aria-label="Copilot is thinking" />}
      </div>

      {error && <p role="alert" className="badge bad" style={{ display: 'inline-block' }}>{error}</p>}

      <form
        onSubmit={(e) => { e.preventDefault(); void send(input); }}
        style={{ display: 'flex', gap: 8, marginTop: 12 }}
      >
        <input
          style={{ flex: 1 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Can we fit FSC-003 and FSC-007 into one sprint?"
          aria-label="Ask Sprint Copilot"
          disabled={busy}
        />
        <button className="action" type="submit" disabled={busy || !input.trim()}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>
    </div>
  );
}

// ── Conflict Resolver ───────────────────────────────────────────────────────
function Conflicts({ conflicts, stories, source, onChanged }: {
  conflicts: ConflictResolution[];
  stories: ScoredStory[];
  source: 'jira' | 'sample';
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const resolvedIds = new Set(conflicts.map((c) => c.storyId));
  const candidates = stories.filter((s) => s.conflictIdx >= 25 && !resolvedIds.has(s.id));

  const generate = async (id: string) => {
    setBusy((b) => ({ ...b, [id]: true }));
    setMsg(`Generating resolution for ${id} with AI…`);
    try {
      await po.aiConflict(id);
      setMsg(null);
      onChanged();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  return (
    <div>
      <p className="hint">High-conflict stories with each stakeholder's position, two resolution options, and a recommended path.</p>
      {source === 'jira' && candidates.length > 0 && (
        <div className="panel">
          <h4 style={{ marginTop: 0 }}>Stories with stakeholder conflict and no resolution yet</h4>
          <div className="chips">
            {candidates.map((s) => (
              <button key={s.id} className="action ghost" onClick={() => generate(s.id)} disabled={busy[s.id]}>
                {busy[s.id] ? 'Generating…' : `Generate for ${s.id} (${s.conflictIdx}% conflict)`}
              </button>
            ))}
          </div>
        </div>
      )}
      {msg && <p className="hint" role="status">{msg}</p>}
      {conflicts.length === 0 && (
        <p className="hint">No conflict resolutions for the current backlog yet{source === 'jira' ? ' — generate them with AI above (requires AI enabled), or use the Tension Board for computed conflict.' : '.'}</p>
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
