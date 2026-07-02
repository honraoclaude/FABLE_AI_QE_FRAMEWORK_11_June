// AI Insights — recommendation cards computed from live portal data.
// Deterministic rule-based analysis (works with AI off); the Sprint Copilot
// provides the conversational layer on top when AI is enabled.

import { useEffect, useMemo, useState } from 'react';
import { api, type Story } from '../api';
import { po, type Backlog } from '../po-api';
import { IconAi, IconAlert, IconCheck, IconFlask, IconLayers, IconShield, IconUsers } from '../icons';

interface Risk { module: string; description: string; band: string; status: string; score: number }
interface TestCase { name: string; module: string; automated: boolean; history: { flaky: boolean } }

interface Insight {
  severity: 'high' | 'medium' | 'positive';
  icon: 'shield' | 'flask' | 'users' | 'layers' | 'alert' | 'check';
  title: string;
  detail: string;
  action?: { label: string; tab: string };
}

const ICONS = { shield: IconShield, flask: IconFlask, users: IconUsers, layers: IconLayers, alert: IconAlert, check: IconCheck };
const TINTS = { high: '#ef4444', medium: '#f59e0b', positive: '#10b981' };

function normalise(t: string): Set<string> {
  return new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w.length > 3));
}

function similarity(a: string, b: string): number {
  const sa = normalise(a), sb = normalise(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let common = 0;
  for (const w of sa) if (sb.has(w)) common++;
  return common / Math.min(sa.size, sb.size);
}

export default function AiInsightsView({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [stories, setStories] = useState<Story[]>([]);
  const [backlog, setBacklog] = useState<Backlog | null>(null);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [tests, setTests] = useState<TestCase[]>([]);
  const [ai, setAi] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      api.stories().then(setStories),
      po.backlog().then(setBacklog),
      fetch('/api/risks').then((r) => r.json()).then((d) => setRisks(d.risks)),
      fetch('/api/tests').then((r) => r.json()).then(setTests),
      fetch('/api/health').then((r) => r.json()).then((h) => setAi(Boolean(h.ai))),
    ]).then(() => setLoaded(true));
  }, []);

  const insights = useMemo<Insight[]>(() => {
    if (!loaded) return [];
    const out: Insight[] = [];
    const poStories = backlog?.stories ?? [];

    // High-risk stories: regulated + weak health
    const riskyReg = poStories.filter((s) => s.regulated && s.health < 70);
    if (riskyReg.length) {
      out.push({
        severity: 'high', icon: 'shield',
        title: `${riskyReg.length} FCA-regulated stor${riskyReg.length === 1 ? 'y is' : 'ies are'} below 70% INVEST health`,
        detail: `${riskyReg.map((s) => s.id).join(', ')} — regulated work entering a sprint under-specified is the highest remediation risk. Route through the 3 Amigos evaluator first.`,
        action: { label: 'Open 3 Amigos', tab: 'amigos' },
      });
    }

    // Missing acceptance criteria
    const noAc = poStories.filter((s) => s.acCount < 3);
    if (noAc.length) {
      out.push({
        severity: 'high', icon: 'alert',
        title: `${noAc.length} stor${noAc.length === 1 ? 'y has' : 'ies have'} fewer than 3 acceptance criteria`,
        detail: `${noAc.map((s) => s.id).join(', ')} — below the DoR gate minimum. Generate AC in the Story Pipeline, review, then push back to Jira.`,
        action: { label: 'Generate AC', tab: 'stories' },
      });
    }

    // Duplicate story detection (title similarity)
    const dupes: string[] = [];
    for (let i = 0; i < poStories.length; i++) {
      for (let j = i + 1; j < poStories.length; j++) {
        if (similarity(poStories[i]!.title, poStories[j]!.title) >= 0.75) {
          dupes.push(`${poStories[i]!.id} ↔ ${poStories[j]!.id}`);
        }
      }
    }
    if (dupes.length) {
      out.push({
        severity: 'medium', icon: 'layers',
        title: `${dupes.length} possible duplicate pair${dupes.length === 1 ? '' : 's'} in the backlog`,
        detail: `${dupes.join('; ')} — titles overlap heavily. Confirm scope before both consume estimation and refinement time.`,
        action: { label: 'Review backlog', tab: 'po' },
      });
    }

    // Open high risks
    const highRisks = risks.filter((r) => r.band === 'high' && r.status === 'open');
    if (highRisks.length) {
      out.push({
        severity: 'high', icon: 'shield',
        title: `${highRisks.length} open high risk${highRisks.length === 1 ? '' : 's'} (score ≥ 8) need immediate action`,
        detail: highRisks.slice(0, 3).map((r) => `${r.module}: ${r.description}`).join(' · '),
        action: { label: 'Open Risk Register', tab: 'risks' },
      });
    }

    // Automation suggestions
    const manual = tests.filter((t) => !t.automated && !t.history.flaky);
    if (manual.length) {
      out.push({
        severity: 'medium', icon: 'flask',
        title: `${manual.length} manual test${manual.length === 1 ? '' : 's'} could be automated`,
        detail: `${manual.slice(0, 3).map((t) => t.name).join(' · ')} — automating these lifts coverage toward the >80% target and shrinks P2 execution time.`,
        action: { label: 'View regression packs', tab: 'regression' },
      });
    }

    // Flaky tests
    const flaky = tests.filter((t) => t.history.flaky);
    if (flaky.length) {
      out.push({
        severity: 'medium', icon: 'flask',
        title: `${flaky.length} flaky test${flaky.length === 1 ? '' : 's'} quarantined`,
        detail: `${flaky.map((t) => t.name).join(' · ')} — quarantined tests never block a release, which means they protect nothing. Stabilise or retire them.`,
        action: { label: 'Open regression packs', tab: 'regression' },
      });
    }

    // Coverage gaps: modules with risks but no tests
    const testedModules = new Set(tests.map((t) => t.module));
    const uncovered = [...new Set(risks.filter((r) => r.status === 'open' && !testedModules.has(r.module)).map((r) => r.module))];
    if (uncovered.length) {
      out.push({
        severity: 'medium', icon: 'alert',
        title: `Coverage gap: ${uncovered.join(', ')} carr${uncovered.length === 1 ? 'ies' : 'y'} open risks but no regression tests`,
        detail: 'Risk-based testing requires at least one mapped test per open risk area — these would silently skip every P1/P2 pack.',
        action: { label: 'Open Risk Register', tab: 'risks' },
      });
    }

    // Predicted release risk (composite)
    const blocked = poStories.filter((s) => s.status === 'Blocked').length;
    const releaseRisk = Math.min(100, highRisks.length * 22 + blocked * 15 + flaky.length * 8 + (noAc.length > 0 ? 15 : 0));
    out.push({
      severity: releaseRisk >= 50 ? 'high' : releaseRisk >= 25 ? 'medium' : 'positive',
      icon: releaseRisk >= 25 ? 'alert' : 'check',
      title: `Predicted release risk: ${releaseRisk}/100`,
      detail: `Composite of open high risks (${highRisks.length}), blocked stories (${blocked}), flaky tests (${flaky.length}) and AC gaps. ${releaseRisk >= 50 ? 'Run the Go/No-Go scorecard before committing a date.' : releaseRisk >= 25 ? 'Manageable — clear the items above before the release window.' : 'Healthy — maintain the current gates.'}`,
      action: { label: 'Open Go / No-Go', tab: 'gonogo' },
    });

    // Positive signal
    const strong = poStories.filter((s) => s.health >= 85).length;
    if (strong > 0) {
      out.push({
        severity: 'positive', icon: 'check',
        title: `${strong} stor${strong === 1 ? 'y' : 'ies'} at 85%+ INVEST health`,
        detail: 'Well-specified and sprint-ready — pull these first when capacity opens up.',
      });
    }

    return out.sort((a, b) => ({ high: 0, medium: 1, positive: 2 }[a.severity] - { high: 0, medium: 1, positive: 2 }[b.severity]));
  }, [loaded, backlog, risks, tests, stories]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>AI Insights</h2>
        <span className="hint">
          {insights.length} finding{insights.length === 1 ? '' : 's'} · computed from live portal data
          {ai ? ' · Claude AI active — ask the Sprint Copilot for narrative analysis' : ' · deterministic rules (AI on standby)'}
        </span>
      </div>

      {!loaded && <div className="skeleton" style={{ height: 220 }} />}

      {loaded && insights.length === 0 && (
        <div className="panel empty">
          <div className="glyph"><IconAi width={22} height={22} /></div>
          <h3 style={{ margin: '0 0 4px' }}>No findings</h3>
          <p className="hint">Sync a backlog from Jira or add stories, tests and risks — insights appear as the data does.</p>
        </div>
      )}

      {insights.map((ins, i) => {
        const Ic = ICONS[ins.icon];
        const tint = TINTS[ins.severity];
        return (
          <div className="insight" key={i}>
            <span className="ic" style={{ background: `${tint}1a`, color: tint }}><Ic width={16} height={16} /></span>
            <div style={{ flex: 1 }}>
              <h4>{ins.title}</h4>
              <p>{ins.detail}</p>
            </div>
            {ins.action && (
              <button className="action ghost" style={{ whiteSpace: 'nowrap' }} onClick={() => onNavigate(ins.action!.tab)}>
                {ins.action.label}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
