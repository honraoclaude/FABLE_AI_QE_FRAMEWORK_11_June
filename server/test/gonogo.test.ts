import { describe, expect, it } from 'vitest';
import { computeScorecard, SIGNAL_WEIGHTS, type SignalScores } from '../src/engines/gonogo.js';

const cleanBlockers = { criticalBugsOpen: 0, p1SmokeAllPassing: true, poSignOffReceived: true };
const perfectSignals: SignalScores = {
  p1SmokeTests: 100,
  p2RiskBasedTests: 100,
  dodCompliance: 100,
  riskRegisterStatus: 100,
  acCoverage: 100,
  defectDensity: 100,
  securityScan: 100,
  performanceBudget: 100,
};

describe('Go/No-Go scorecard (§8)', () => {
  it('weights sum to 100', () => {
    expect(Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('perfect signals + clean blockers → 100, GO, QE Lead sign-off', () => {
    const r = computeScorecard(cleanBlockers, perfectSignals);
    expect(r.score).toBe(100);
    expect(r.recommendation).toBe('go');
    expect(r.approvalRequired).toMatch(/QE Lead/);
  });

  it('any hard blocker → NO GO regardless of score', () => {
    const r = computeScorecard({ ...cleanBlockers, criticalBugsOpen: 1 }, perfectSignals);
    expect(r.blocked).toBe(true);
    expect(r.recommendation).toBe('no_go');

    const r2 = computeScorecard({ ...cleanBlockers, p1SmokeAllPassing: false }, perfectSignals);
    expect(r2.recommendation).toBe('no_go');

    const r3 = computeScorecard({ ...cleanBlockers, poSignOffReceived: false }, perfectSignals);
    expect(r3.recommendation).toBe('no_go');
  });

  it('75–89 → conditional GO requiring QE Lead + PO + Release Manager', () => {
    const r = computeScorecard(cleanBlockers, { ...perfectSignals, p1SmokeTests: 50, p2RiskBasedTests: 40 });
    // 100 - 10 (P1 half of 20) - 9 (P2 60% of 15) = 81
    expect(r.score).toBe(81);
    expect(r.recommendation).toBe('conditional_go');
  });

  it('50–74 → high-risk GO requiring all stakeholders', () => {
    const r = computeScorecard(cleanBlockers, {
      ...perfectSignals,
      p1SmokeTests: 0,
      p2RiskBasedTests: 0,
      dodCompliance: 0,
    });
    expect(r.score).toBe(50);
    expect(r.recommendation).toBe('high_risk_go');
  });

  it('<50 → NO GO, release deferred', () => {
    const r = computeScorecard(cleanBlockers, {
      p1SmokeTests: 0, p2RiskBasedTests: 0, dodCompliance: 0, riskRegisterStatus: 0,
      acCoverage: 100, defectDensity: 100, securityScan: 100, performanceBudget: 100,
    });
    expect(r.score).toBe(35);
    expect(r.recommendation).toBe('no_go');
  });

  it('clamps out-of-range signal scores', () => {
    const r = computeScorecard(cleanBlockers, { ...perfectSignals, p1SmokeTests: 250 });
    expect(r.score).toBe(100);
  });
});
