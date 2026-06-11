// Defect Density Index — QE Framework §7.2
// DDI = (Σ defects × severity weight) ÷ stories delivered in that area.
// Thresholds: ≥2.5 high · 1.0–2.4 medium · <1.0 low.

import type { DefectSeverity } from '../types.js';

export const SEVERITY_WEIGHTS: Record<DefectSeverity, number> = {
  critical: 5,
  high: 3,
  medium: 2,
  low: 1,
};

export type DdiBand = 'high' | 'medium' | 'low';

export interface DdiResult {
  ddi: number;
  band: DdiBand;
  regressionScope: string;
  action: string;
}

export function computeDdi(
  defects: { severity: DefectSeverity }[],
  storiesDelivered: number,
): DdiResult {
  const weighted = defects.reduce((sum, d) => sum + SEVERITY_WEIGHTS[d.severity], 0);
  // No delivery history: any defect weight means an unmeasurable hot spot —
  // treat as high; a clean module with no deliveries scores 0.
  const ddi =
    storiesDelivered > 0
      ? Math.round((weighted / storiesDelivered) * 100) / 100
      : weighted > 0
        ? Number.POSITIVE_INFINITY
        : 0;

  let band: DdiBand;
  let regressionScope: string;
  let action: string;
  if (ddi >= 2.5) {
    band = 'high';
    regressionScope = 'Always P2, escalate to QE Lead';
    action = 'Immediate review';
  } else if (ddi >= 1.0) {
    band = 'medium';
    regressionScope = 'Included in P2 risk-based scope';
    action = 'Assign mitigation';
  } else {
    band = 'low';
    regressionScope = 'P3 only unless directly changed';
    action = 'Monitor';
  }

  return { ddi, band, regressionScope, action };
}
