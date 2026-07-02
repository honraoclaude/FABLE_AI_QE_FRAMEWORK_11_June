// Auto-populated Go/No-Go — derives the §8 scorecard signals from live portal
// data instead of manual inputs. Every signal carries its evidence so the
// release decision is explainable (and auditable). Signals with no data source
// yet default to 100 with an explicit caveat rather than silently passing.

import type { Defect, Story, TestCase } from '../types.js';
import type { HardBlockerInput, SignalScores } from './gonogo.js';
import { computeDdi } from './ddi.js';
import { devSelfCertify, qeVerify } from './dod.js';

export interface LiveGonogoInput {
  stories: Story[];
  defects: Defect[];
  tests: TestCase[];
  risks: { band: string; status: string }[];
  /** story ids that have at least one AC scenario */
  storiesWithAc: Set<string>;
}

export interface LiveSignal {
  value: number;
  evidence: string;
}

export interface LiveGonogo {
  blockers: HardBlockerInput & { notes: string[] };
  signals: Record<keyof SignalScores, LiveSignal>;
}

const pct = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 100) : 100);

export function computeLiveGonogo(input: LiveGonogoInput): LiveGonogo {
  const { stories, defects, tests, risks } = input;

  // ── Hard blockers ────────────────────────────────────────────────────────
  const criticalOpen = defects.filter((d) => d.status === 'open' && d.severity === 'critical').length;
  const smoke = tests.filter((t) => t.smoke && !t.history.flaky);
  const smokeFailing = smoke.filter((t) => t.history.failedInLastRelease);
  const blockers = {
    criticalBugsOpen: criticalOpen,
    p1SmokeAllPassing: smoke.length > 0 ? smokeFailing.length === 0 : true,
    poSignOffReceived: false, // always a human decision — never auto-derived
    notes: [
      `${criticalOpen} open critical defect(s) in the portal`,
      smoke.length > 0
        ? `${smoke.length - smokeFailing.length}/${smoke.length} P1 smoke tests passing on last recorded execution`
        : 'No P1 smoke tests recorded — treat P1 status as unverified',
      'PO sign-off must be confirmed manually — it is a human accountability, not a metric',
    ],
  };

  // ── Signals ──────────────────────────────────────────────────────────────
  // P1/P2: pass rate of last recorded execution (real once Zephyr/CI results sync).
  const p1Pass = pct(smoke.length - smokeFailing.length, smoke.length);
  const p2Pool = tests.filter((t) => !t.smoke && !t.history.flaky);
  const p2Failing = p2Pool.filter((t) => t.history.failedInLastRelease);
  const p2Pass = pct(p2Pool.length - p2Failing.length, p2Pool.length);

  // DoD compliance: stories at/past self-certification whose gates actually pass.
  const inDod = stories.filter((s) =>
    ['dev_self_certification', 'qe_verification', 'ready_for_release', 'released'].includes(s.status),
  );
  const dodPassing = inDod.filter(
    (s) => devSelfCertify(s.type, s.dodChecks).complete || qeVerify(s.type, s.dodVerified).passed,
  );
  const dodCompliance = pct(dodPassing.length, inDod.length);

  // Risk register: start from 100, subtract per open risk by band.
  const highOpen = risks.filter((r) => r.status === 'open' && r.band === 'high').length;
  const medOpen = risks.filter((r) => r.status === 'open' && r.band === 'medium').length;
  const riskScore = Math.max(0, 100 - highOpen * 25 - medOpen * 10);

  // AC coverage: stories that have generated/approved scenarios.
  const acCovered = stories.filter((s) => input.storiesWithAc.has(s.id)).length;
  const acCoverage = pct(acCovered, stories.length);

  // Defect density: overall DDI band → score.
  const released = stories.filter((s) => s.status === 'released').length;
  const ddi = computeDdi(defects.filter((d) => d.status === 'open'), released);
  const defectDensity = ddi.band === 'low' ? 100 : ddi.band === 'medium' ? 60 : 25;

  return {
    blockers,
    signals: {
      p1SmokeTests: {
        value: p1Pass,
        evidence: smoke.length > 0
          ? `${smoke.length - smokeFailing.length}/${smoke.length} P1 tests passing (last recorded execution; flaky quarantined)`
          : 'No P1 tests recorded — sync Zephyr or add smoke tests; defaulting to 100 is NOT safe for release',
      },
      p2RiskBasedTests: {
        value: p2Pass,
        evidence: p2Pool.length > 0
          ? `${p2Pool.length - p2Failing.length}/${p2Pool.length} P2-eligible tests passing on last execution`
          : 'No P2 tests recorded',
      },
      dodCompliance: {
        value: dodCompliance,
        evidence: inDod.length > 0
          ? `${dodPassing.length}/${inDod.length} stories at DoD stage pass their gate checks`
          : 'No stories have reached the DoD stage this release',
      },
      riskRegisterStatus: {
        value: riskScore,
        evidence: `${highOpen} high + ${medOpen} medium risks open (−25/high, −10/medium)`,
      },
      acCoverage: {
        value: acCoverage,
        evidence: `${acCovered}/${stories.length} stories have acceptance criteria in the portal`,
      },
      defectDensity: {
        value: defectDensity,
        evidence: `Open-defect DDI ${Number.isFinite(ddi.ddi) ? ddi.ddi : '∞'} → ${ddi.band} band`,
      },
      securityScan: {
        value: 100,
        evidence: 'No SAST/DAST findings are ingested by the portal yet — verify the Semgrep/ZAP results in CI before trusting this signal',
      },
      performanceBudget: {
        value: 100,
        evidence: 'No performance results ingested — verify Lighthouse CI in the pipeline before trusting this signal',
      },
    },
  };
}
