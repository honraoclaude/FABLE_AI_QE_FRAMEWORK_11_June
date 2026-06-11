// Go/No-Go scorecard — QE Framework §8
// Hard blockers gate the release outright; otherwise eight weighted signals
// produce a 0–100 quality score with recommendation thresholds.

export interface HardBlockerInput {
  criticalBugsOpen: number;
  p1SmokeAllPassing: boolean;
  poSignOffReceived: boolean;
}

/** Each signal is a 0–100 sub-score (e.g. % of P1 tests passing). */
export interface SignalScores {
  p1SmokeTests: number;
  p2RiskBasedTests: number;
  dodCompliance: number;
  riskRegisterStatus: number;
  acCoverage: number;
  defectDensity: number;
  securityScan: number;
  performanceBudget: number;
}

/** Weights per §8.2 — sum to 100. */
export const SIGNAL_WEIGHTS: Record<keyof SignalScores, number> = {
  p1SmokeTests: 20,
  p2RiskBasedTests: 15,
  dodCompliance: 15,
  riskRegisterStatus: 15,
  acCoverage: 10,
  defectDensity: 10,
  securityScan: 10,
  performanceBudget: 5,
};

export type Recommendation = 'go' | 'conditional_go' | 'high_risk_go' | 'no_go';

export interface Scorecard {
  blocked: boolean;
  blockerFailures: string[];
  score: number;
  recommendation: Recommendation;
  approvalRequired: string;
  breakdown: { signal: keyof SignalScores; weight: number; subScore: number; weighted: number }[];
}

export function computeScorecard(blockers: HardBlockerInput, signals: SignalScores): Scorecard {
  const blockerFailures: string[] = [];
  if (blockers.criticalBugsOpen > 0) {
    blockerFailures.push(`${blockers.criticalBugsOpen} critical bug(s) open — must be zero`);
  }
  if (!blockers.p1SmokeAllPassing) blockerFailures.push('P1 smoke tests not all passing');
  if (!blockers.poSignOffReceived) blockerFailures.push('PO sign-off not received');

  const breakdown = (Object.keys(SIGNAL_WEIGHTS) as (keyof SignalScores)[]).map((signal) => {
    const subScore = clamp(signals[signal]);
    const weight = SIGNAL_WEIGHTS[signal];
    return { signal, weight, subScore, weighted: (subScore * weight) / 100 };
  });
  const score = Math.round(breakdown.reduce((s, b) => s + b.weighted, 0));

  const blocked = blockerFailures.length > 0;
  let recommendation: Recommendation;
  let approvalRequired: string;
  if (blocked || score < 50) {
    recommendation = 'no_go';
    approvalRequired = 'Release deferred';
  } else if (score >= 90) {
    recommendation = 'go';
    approvalRequired = 'QE Lead sign-off';
  } else if (score >= 75) {
    recommendation = 'conditional_go';
    approvalRequired = 'QE Lead + PO + Release Manager';
  } else {
    recommendation = 'high_risk_go';
    approvalRequired = 'All stakeholders must approve explicitly';
  }

  return { blocked, blockerFailures, score, recommendation, approvalRequired, breakdown };
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}
