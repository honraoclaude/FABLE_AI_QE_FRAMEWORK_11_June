import { useState, type ComponentType, type SVGProps } from 'react';
import StoriesView from './views/StoriesView';
import ProductOwnerView from './views/ProductOwnerView';
import ThreeAmigosView from './views/ThreeAmigosView';
import RisksView from './views/RisksView';
import RbtView from './views/RbtView';
import RegressionView from './views/RegressionView';
import GoNoGoView from './views/GoNoGoView';
import MetricsView from './views/MetricsView';
import {
  IconBell, IconChart, IconDashboard, IconFlag, IconFlask, IconLayers, IconPipeline, IconSearch, IconShield, IconSpark, IconUsers,
} from './icons';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const TABS: { id: string; label: string; icon: Icon }[] = [
  { id: 'stories', label: 'Story Pipeline', icon: IconPipeline },
  { id: 'po', label: 'Product Owner', icon: IconDashboard },
  { id: 'amigos', label: '3 Amigos', icon: IconUsers },
  { id: 'risks', label: 'Risk Register', icon: IconShield },
  { id: 'rbt', label: 'RBT Testing', icon: IconFlask },
  { id: 'regression', label: 'Regression Pack', icon: IconLayers },
  { id: 'gonogo', label: 'Go / No-Go', icon: IconFlag },
  { id: 'metrics', label: 'Metrics', icon: IconChart },
];

type TabId = (typeof TABS)[number]['id'];

export default function App() {
  const [tab, setTab] = useState<TabId>('stories');
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden><IconSpark width={18} height={18} /></span>
          <div>
            <div className="title">QE Intelligence Portal</div>
            <div className="sub">Financial Services · FCA-regulated</div>
          </div>
        </div>
        <div className="search">
          <IconSearch width={15} height={15} />
          <input type="text" placeholder="Search stories, risks, metrics…" aria-label="Global search" />
        </div>
        <button className="icon-btn" aria-label="Notifications"><IconBell /><span className="dot" /></button>
        <span className="avatar" title="Omkar Honrao" aria-label="User profile">OH</span>
      </header>

      <nav className="mainnav" aria-label="Primary">
        <div className="row" role="tablist">
          {TABS.map((t) => {
            const Ic = t.icon;
            return (
              <button key={t.id} role="tab" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}>
                <Ic /> {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main id={`panel-${tab}`} role="tabpanel" aria-label={active.label} className="content">
        {tab === 'stories' && <StoriesView />}
        {tab === 'po' && <ProductOwnerView />}
        {tab === 'amigos' && <ThreeAmigosView />}
        {tab === 'risks' && <RisksView />}
        {tab === 'rbt' && <RbtView />}
        {tab === 'regression' && <RegressionView />}
        {tab === 'gonogo' && <GoNoGoView />}
        {tab === 'metrics' && <MetricsView />}
      </main>
    </div>
  );
}
