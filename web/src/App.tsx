import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type SVGProps } from 'react';
import DashboardView from './views/DashboardView';
import StoriesView from './views/StoriesView';
import ProductOwnerView from './views/ProductOwnerView';
import ThreeAmigosView from './views/ThreeAmigosView';
import RisksView from './views/RisksView';
import RbtView from './views/RbtView';
import RegressionView from './views/RegressionView';
import GoNoGoView from './views/GoNoGoView';
import MetricsView from './views/MetricsView';
import AiInsightsView from './views/AiInsightsView';
import ReportsView from './views/ReportsView';
import SettingsView from './views/SettingsView';
import AuditView from './views/AuditView';
import {
  IconAi, IconBell, IconChart, IconChevronLeft, IconCommand, IconDashboard, IconFlag, IconFlask, IconHome,
  IconLayers, IconMoon, IconPipeline, IconReport, IconSearch, IconSettings, IconShield, IconSpark, IconSun, IconUsers,
} from './icons';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem { id: string; label: string; icon: Icon; section?: string }

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: IconHome },
  { id: 'stories', label: 'Story Pipeline', icon: IconPipeline },
  { id: 'po', label: 'Product Owner', icon: IconDashboard },
  { id: 'amigos', label: '3 Amigos', icon: IconUsers },
  { id: 'risks', label: 'Risk Register', icon: IconShield },
  { id: 'rbt', label: 'RBT Testing', icon: IconFlask },
  { id: 'regression', label: 'Regression Packs', icon: IconLayers },
  { id: 'gonogo', label: 'Go / No-Go', icon: IconFlag },
  { id: 'metrics', label: 'Metrics', icon: IconChart },
  { id: 'insights', label: 'AI Insights', icon: IconAi, section: 'Intelligence' },
  { id: 'reports', label: 'Reports', icon: IconReport },
  { id: 'audit', label: 'Audit Trail', icon: IconShield, section: 'System' },
  { id: 'settings', label: 'Settings', icon: IconSettings },
];

type TabId = (typeof NAV)[number]['id'];

function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState(() => localStorage.getItem('qe-theme') ?? 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('qe-theme', theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))];
}

export default function App() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    // lightweight badge counts for the sidebar
    fetch('/api/stories').then((r) => r.json()).then((s: unknown[]) => setCounts((c) => ({ ...c, stories: s.length }))).catch(() => undefined);
    fetch('/api/risks').then((r) => r.json()).then((d: { risks: { status: string }[] }) =>
      setCounts((c) => ({ ...c, risks: d.risks.filter((x) => x.status === 'open').length }))).catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const active = NAV.find((t) => t.id === tab)!;
  const badges: Record<string, number | undefined> = { stories: counts.stories, risks: counts.risks };

  return (
    <div className="app">
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="brand">
          <span className="logo" aria-hidden><IconSpark width={18} height={18} /></span>
          <div>
            <div className="title">QE Intelligence Portal</div>
            <div className="sub">FCA-regulated · AI-first</div>
          </div>
        </div>
        <nav role="tablist" aria-label="Primary">
          {NAV.map((t) => {
            const Ic = t.icon;
            return (
              <div key={t.id}>
                {t.section && <div className="nav-sep">{t.section}</div>}
                <button role="tab" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)} title={t.label}>
                  <Ic />
                  <span>{t.label}</span>
                  {badges[t.id] !== undefined && <span className="nav-badge">{badges[t.id]}</span>}
                </button>
              </div>
            );
          })}
        </nav>
        <button className="collapse-btn" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <IconChevronLeft />
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="search" onClick={() => setPaletteOpen(true)} aria-label="Open command palette (Ctrl+K)" style={{ font: 'inherit', cursor: 'pointer' }}>
            <IconSearch width={15} height={15} />
            <span style={{ flex: 1, textAlign: 'left', color: 'var(--muted)' }}>Search or jump to…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <span className="select-chip">Sprint
            <select aria-label="Sprint selector" defaultValue="Sprint 6">
              {['Sprint 4', 'Sprint 5', 'Sprint 6', 'Sprint 7'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </span>
          <span className="select-chip">Env
            <select aria-label="Environment selector" defaultValue="Staging">
              {['Dev', 'Staging', 'Production'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </span>
          <button className="icon-btn" aria-label="AI Assistant" title="AI Insights" onClick={() => setTab('insights')}><IconAi /></button>
          <button className="icon-btn" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} onClick={toggleTheme}>
            {theme === 'light' ? <IconMoon /> : <IconSun />}
          </button>
          <button className="icon-btn" aria-label="Notifications"><IconBell /><span className="dot" /></button>
          <span className="avatar" title="Omkar Honrao" aria-label="User profile">OH</span>
        </header>

        <main id={`panel-${tab}`} role="tabpanel" aria-label={active.label} className="content" key={tab}>
          {tab === 'dashboard' && <DashboardView onNavigate={(id) => setTab(id)} />}
          {tab === 'stories' && <StoriesView />}
          {tab === 'po' && <ProductOwnerView />}
          {tab === 'amigos' && <ThreeAmigosView />}
          {tab === 'risks' && <RisksView />}
          {tab === 'rbt' && <RbtView />}
          {tab === 'regression' && <RegressionView />}
          {tab === 'gonogo' && <GoNoGoView />}
          {tab === 'metrics' && <MetricsView />}
          {tab === 'insights' && <AiInsightsView onNavigate={(id) => setTab(id)} />}
          {tab === 'reports' && <ReportsView />}
          {tab === 'audit' && <AuditView />}
          {tab === 'settings' && <SettingsView />}
        </main>
      </div>

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onGo={(id) => { setTab(id); setPaletteOpen(false); }}
        />
      )}
    </div>
  );
}

// ── Command palette (Ctrl+K) ──────────────────────────────────────────────────
function CommandPalette({ onClose, onGo }: { onClose: () => void; onGo: (id: TabId) => void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const items = useMemo(
    () => NAV.filter((n) => n.label.toLowerCase().includes(q.toLowerCase())),
    [q],
  );

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    if (e.key === 'Enter' && items[idx]) onGo(items[idx].id);
  };

  return (
    <div className="cmdk-overlay" onClick={onClose} role="dialog" aria-label="Command palette">
      <div className="cmdk" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setIdx(0); }}
          placeholder="Jump to a section…"
          aria-label="Command palette search"
        />
        <div className="cmdk-list">
          {items.map((n, i) => {
            const Ic = n.icon;
            return (
              <button key={n.id} className={`cmdk-item${i === idx ? ' active' : ''}`} onClick={() => onGo(n.id)}>
                <Ic /> {n.label}
              </button>
            );
          })}
          {items.length === 0 && <div className="cmdk-hint">No matches</div>}
        </div>
        <div className="cmdk-hint"><IconCommand width={11} height={11} /> Ctrl+K to toggle · ↑↓ to navigate · Enter to open · Esc to close</div>
      </div>
    </div>
  );
}
