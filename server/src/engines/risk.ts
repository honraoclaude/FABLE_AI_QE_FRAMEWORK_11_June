// Product Risk Register engine — QE Framework §6
// Severity × Likelihood scoring matrix with action bands:
//   1–3 low (monitor) · 4–6 medium (assign mitigation) · ≥8 high (immediate
//   action, QE Lead notified).

import type { RiskBand, RiskType } from '../types.js';

export const RISK_TYPES: { type: RiskType; label: string; description: string }[] = [
  { type: 'coverage_gap', label: 'Coverage Gap', description: 'No tests exist for a critical area' },
  { type: 'dependency', label: 'Dependency Risk', description: 'External system or team could block quality' },
  { type: 'regression', label: 'Regression Risk', description: 'Change likely to break another area' },
  { type: 'complexity', label: 'Complexity Risk', description: 'Story too large or unclear to test confidently' },
  { type: 'technical_debt', label: 'Technical Debt Risk', description: 'Accumulated shortcuts creating fragility' },
  { type: 'data', label: 'Data Risk', description: 'Test data gaps, prod-like data not available' },
  { type: 'performance', label: 'Performance Risk', description: 'No perf baseline, high-traffic area untested' },
  { type: 'security', label: 'Security Risk', description: 'Auth, input validation, or data exposure concern' },
];

export interface RiskScore {
  score: number;
  band: RiskBand;
  action: string;
  notifyQeLead: boolean;
}

const LEVEL_MIN = 1;
const LEVEL_MAX = 4; // low(1) medium(2) high(3) critical(4)

export function scoreRisk(severity: number, likelihood: number): RiskScore {
  if (
    !Number.isInteger(severity) || !Number.isInteger(likelihood) ||
    severity < LEVEL_MIN || severity > LEVEL_MAX ||
    likelihood < LEVEL_MIN || likelihood > LEVEL_MAX
  ) {
    throw new Error(`severity and likelihood must be integers ${LEVEL_MIN}–${LEVEL_MAX}`);
  }
  const score = severity * likelihood;

  let band: RiskBand;
  let action: string;
  if (score <= 3) {
    band = 'low';
    action = 'Monitor';
  } else if (score <= 6) {
    band = 'medium';
    action = 'Assign mitigation';
  } else {
    band = 'high';
    action = 'Immediate action required, QE Lead notified';
  }

  return { score, band, action, notifyQeLead: band === 'high' };
}

/** Aggregate the highest open risk score per module — feeds P2 regression selection (§7.1). */
export function moduleRiskScores(
  risks: { module: string; score: number; status: string }[],
): Record<string, number> {
  const byModule: Record<string, number> = {};
  for (const r of risks) {
    if (r.status !== 'open') continue;
    byModule[r.module] = Math.max(byModule[r.module] ?? 0, r.score);
  }
  return byModule;
}
