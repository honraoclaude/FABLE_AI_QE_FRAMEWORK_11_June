import { useState } from 'react';
import StoriesView from './views/StoriesView';
import ThreeAmigosView from './views/ThreeAmigosView';
import RisksView from './views/RisksView';
import RbtView from './views/RbtView';
import RegressionView from './views/RegressionView';
import GoNoGoView from './views/GoNoGoView';
import MetricsView from './views/MetricsView';

const TABS = [
  { id: 'stories', label: 'Story Pipeline' },
  { id: 'amigos', label: '3 Amigos' },
  { id: 'risks', label: 'Product Risk Register' },
  { id: 'rbt', label: 'RBT Testing Approach' },
  { id: 'regression', label: 'Regression Pack' },
  { id: 'gonogo', label: 'Go / No-Go' },
  { id: 'metrics', label: 'Quality Metrics' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function App() {
  const [tab, setTab] = useState<TabId>('stories');

  return (
    <div className="shell">
      <header className="masthead">
        <h1>QE Portal</h1>
        <p>Quality Engineering Framework — shift-left testing, AI-assisted analysis, clear accountability</p>
      </header>

      <nav className="tabs" role="tablist" aria-label="Portal sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main id={`panel-${tab}`} role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === 'stories' && <StoriesView />}
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
