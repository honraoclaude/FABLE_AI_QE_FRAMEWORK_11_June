// Executive Dashboard — the landing page. Every figure is derived from live
// portal data (QE stories, tests, defects, risks, PO backlog, snapshots).

import { useEffect, useMemo, useState } from 'react';
import { api, type Metric, type Story } from '../api';
import { po, type Backlog, type Trends } from '../po-api';
import { Donut, Flow, Gauge, KpiCard, trendSeries, useCountUp } from '../components/dashboard';
import { IconAi, IconChart, IconFlag, IconFlask, IconLayers, IconPipeline, IconPlus, IconReport, IconShield, IconSpark, IconSync, IconUsers } from '../icons';

interface Risk { band: string; status: string }
interface TestCase { automated: boolean; history: { flaky: boolean } }

export const PIPELINE_STAGES: { label: string; statuses: string[] }[] = [
  { label: 'Backlog', statuses: ['backlog'] },
  { label: 'DoR', statuses: ['in_readiness_review', 'actions_pending'] },
  { label: '3 Amigos', statuses: ['ready_for_3_amigos', 'three_amigos_complete'] },
  { label: 'AC', statuses: ['ac_draft_in_review'] },
  { label: 'Development', statuses: ['ready_for_dev', 'in_development'] },
  { label: 'Dual DoD', statuses: ['dev_self_certification'] },
  { label: 'Testing', statuses: ['qe_verification'] },
  { label: 'Release', statuses: ['ready_for_release', 'released'] },
];

export function stageCounts(stories: Story[]): { label: string; count: number }[] {
  return PIPELINE_STAGES.map((st) => ({
    label: st.label,
    count: stories.filter((s) => st.statuses.includes(s.status)).length,
  }));
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardView({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [tests, setTests] = useState<TestCase[]>([]);
  const [defects, setDefects] = useState<{ status: string; severity: string }[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [backlog, setBacklog] = useState<Backlog | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [ai, setAi] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api.stories().then(setStories).catch(() => setStories([]));
    fetch('/api/tests').then((r) => r.json()).then(setTests).catch(() => undefined);
    fetch('/api/defects').then((r) => r.json()).then(setDefects).catch(() => undefined);
    fetch('/api/risks').then((r) => r.json()).then((d) => setRisks(d.risks)).catch(() => undefined);
    fetch('/api/health').then((r) => r.json()).then((h) => setAi(Boolean(h.ai))).catch(() => undefined);
    api.metrics().then(setMetrics).catch(() => undefined);
    po.backlog().then(setBacklog).catch(() => undefined);
    po.trends().then(setTrends).catch(() => undefined);
  }, []);

  const k = useMemo(() => {
    const s = stories ?? [];
    const openDefects = defects.filter((d) => d.status === 'open').length;
    const automated = tests.filter((t) => t.automated).length;
    const automationPct = tests.length ? Math.round((automated / tests.length) * 100) : 0;
    const flaky = tests.filter((t) => t.history.flaky).length;
    const highRisks = risks.filter((r) => r.band === 'high' && r.status === 'open').length;
    const inDev = s.filter((x) => ['ready_for_dev', 'in_development'].includes(x.status)).length;
    const verifying = s.filter((x) => ['dev_self_certification', 'qe_verification'].includes(x.status)).length;
    const released = s.filter((x) => x.status === 'released').length;
    const poSum = backlog?.summary;
    const readinessPct = poSum ? Math.round((poSum.ready / poSum.total) * 100) : 0;
    const totalRice = backlog ? backlog.stories.reduce((sum, x) => sum + x.riceScore, 0) : 0;
    const health = poSum
      ? Math.round((poSum.avgHealth + readinessPct + automationPct) / 3)
      : automationPct;
    return { s, openDefects, automationPct, flaky, highRisks, inDev, verifying, released, poSum, readinessPct, totalRice, health };
  }, [stories, tests, defects, risks, backlog]);

  const healthAnimated = useCountUp(k.health);

  const syncJira = async () => {
    setSyncing(true);
    setSyncMsg('Syncing…');
    try {
      const qe = await fetch('/api/jira/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json());
      await po.jiraSync().catch(() => undefined);
      setSyncMsg(qe.error ? String(qe.error) : `Synced ${qe.fetched ?? 0} stories from Jira`);
      api.stories().then(setStories).catch(() => undefined);
      po.backlog().then(setBacklog).catch(() => undefined);
    } catch (e) {
      setSyncMsg(String(e));
    } finally {
      setSyncing(false);
    }
  };

  if (!stories) {
    return (
      <div>
        <div className="skeleton" style={{ height: 150, marginBottom: 16 }} />
        <div className="kpis">{[...Array(8)].map((_, i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}</div>
      </div>
    );
  }

  const donutSegments = [
    { label: 'Sprint Ready', value: k.poSum?.ready ?? 0, color: '#10b981' },
    { label: 'Needs Refinement', value: k.poSum?.refine ?? 0, color: '#f59e0b' },
    { label: 'Blocked', value: k.poSum?.blocked ?? 0, color: '#ef4444' },
  ];
  const coverageMetric = metrics.find((m) => m.id === 'automation_coverage');

  return (
    <div>
      {/* Hero */}
      <div className="hero">
        <div className="greeting">{greeting()}, Omkar</div>
        <h2>QE Intelligence Portal</h2>
        <p>Live quality, risk and readiness across the delivery lifecycle — powered by your engines and {ai ? 'Claude AI' : 'deterministic analysis (AI standby)'}.</p>
        <div className="status-badges">
          <div className="status-badge"><div className="lbl">Current Sprint</div><div className="val">Sprint 6 · Q2</div></div>
          <div className="status-badge"><div className="lbl">Release</div><div className="val">v2.4.0 → Staging</div></div>
          <div className="status-badge"><div className="lbl">Quality Health</div><div className="val"><span style={{ width: 8, height: 8, borderRadius: 4, background: k.health >= 70 ? '#10b981' : '#f59e0b' }} />{Math.round(healthAnimated)}%</div></div>
          <div className="status-badge"><div className="lbl">AI Assist</div><div className="val"><span style={{ width: 8, height: 8, borderRadius: 4, background: ai ? '#10b981' : '#94a3b8' }} />{ai ? 'Active' : 'Standby'}</div></div>
          <div className="status-badge"><div className="lbl">Open High Risks</div><div className="val">{k.highRisks}</div></div>
        </div>
        <div className="quick-actions">
          <button onClick={syncJira} disabled={syncing}><IconSync width={14} height={14} /> {syncing ? 'Syncing…' : 'Sync Jira'}</button>
          <button onClick={() => onNavigate('stories')}><IconPlus width={14} height={14} /> Create Story</button>
          <button onClick={() => onNavigate('insights')}><IconAi width={14} height={14} /> Run AI Review</button>
          <button onClick={() => onNavigate('reports')}><IconReport width={14} height={14} /> Generate Report</button>
        </div>
        {syncMsg && <p style={{ color: '#a5b4fc', fontSize: 12.5, margin: '10px 0 0', position: 'relative' }} role="status">{syncMsg}</p>}
      </div>

      {/* KPI grid */}
      <div className="kpis">
        <KpiCard icon={IconLayers} tint="#4f46e5" label="Total Stories" value={k.s.length} series={trendSeries(k.s.length)} context="QE pipeline" />
        <KpiCard icon={IconPipeline} tint="#0891b2" label="In Development" value={k.inDev} series={trendSeries(k.inDev)} context="ready for dev + in dev" />
        <KpiCard icon={IconFlask} tint="#7c3aed" label="In Verification" value={k.verifying} series={trendSeries(k.verifying)} context="Dual DoD + QE testing" />
        <KpiCard icon={IconFlag} tint="#10b981" label="Released" value={k.released} series={trendSeries(k.released)} context="delivered stories" />
        <KpiCard icon={IconShield} tint="#ef4444" label="Open Defects" value={k.openDefects} series={trendSeries(k.openDefects)} context={`${defects.length} total logged`} />
        <KpiCard icon={IconChart} tint="#10b981" label="Automation" value={`${k.automationPct}%`} series={trendSeries(k.automationPct)} context={coverageMetric ? `target ${coverageMetric.target}` : `${tests.length} tests`} />
        <KpiCard icon={IconFlask} tint="#f59e0b" label="Flaky Tests" value={k.flaky} series={trendSeries(Math.max(1, k.flaky))} context="quarantined from packs" />
        <KpiCard icon={IconShield} tint="#f59e0b" label="High Risks" value={k.highRisks} series={trendSeries(Math.max(1, k.highRisks))} context="open, score ≥ 8" />
        {k.poSum && (
          <>
            <KpiCard icon={IconChart} tint="#4f46e5" label="Backlog Health" value={`${k.poSum.avgHealth}%`} series={trendSeries(k.poSum.avgHealth)} context="avg INVEST score" />
            <KpiCard icon={IconFlag} tint="#10b981" label="Sprint Ready" value={`${k.readinessPct}%`} series={trendSeries(k.readinessPct)} context={`${k.poSum.ready}/${k.poSum.total} stories`} />
            <KpiCard icon={IconSpark} tint="#7c3aed" label="Total RICE" value={k.totalRice.toLocaleString()} series={trendSeries(k.totalRice / 1000)} context="weighted backlog value" />
            <KpiCard icon={IconUsers} tint="#ef4444" label="FCA-Regulated" value={k.poSum.regulatedCount} series={trendSeries(k.poSum.regulatedCount)} context="need compliance sign-off" />
          </>
        )}
      </div>
      {trends && trends.points.length >= 2 && (
        <p className="hint" style={{ marginTop: 6 }}>Backlog trend history: {trends.points.length} snapshots recorded.</p>
      )}

      {/* Pipeline flow */}
      <div className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Delivery Pipeline</h3>
        <p className="hint">Where the {k.s.length} QE stories sit across the shift-left lifecycle.</p>
        <Flow stages={stageCounts(k.s)} />
      </div>

      {/* Widgets */}
      <div className="grid3">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Backlog Readiness</h3>
          {k.poSum ? <Donut segments={donutSegments} label="stories" /> : <p className="hint">Product Owner backlog unavailable.</p>}
        </div>
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Gauge value={k.health} label="Quality Health Score" sub="health · readiness · automation" color={k.health >= 70 ? '#10b981' : '#f59e0b'} />
        </div>
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Gauge value={k.automationPct} label="Automation Maturity" sub={`${tests.filter((t) => t.automated).length}/${tests.length} automated`} color="#4f46e5" />
        </div>
      </div>
    </div>
  );
}
