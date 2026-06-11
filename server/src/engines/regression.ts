// Risk-based regression pack builder — QE Framework §7
// Combines risk register scores, changed modules, DDI, regression-tagged AC,
// and previously-failed test history into a tiered P1/P2/P3 pack.

import type { TestCase } from '../types.js';
import type { DdiBand } from './ddi.js';

export interface RegressionInputs {
  tests: TestCase[];
  /** Highest open risk score per module (from the Risk Register) */
  moduleRiskScores: Record<string, number>;
  /** DDI band per module */
  moduleDdiBands: Record<string, DdiBand>;
  /** Modules touched by stories/PRs in this release */
  changedModules: string[];
  releaseKind: 'standard' | 'major';
}

export interface SelectedTest {
  test: TestCase;
  reasons: string[];
}

export interface RegressionPack {
  p1: SelectedTest[]; // smoke — always runs, every release, <10 min, failure blocks
  p2: SelectedTest[]; // risk-based — failure blocks pending triage, <2 h
  p3: SelectedTest[]; // full regression — pre-major release or quarterly
  quarantined: SelectedTest[]; // flaky — manual verify, never blocks release
}

const RISK_THRESHOLD_P2 = 6; // §7.3 — AI selects based on risk score ≥ 6

export function buildRegressionPack(input: RegressionInputs): RegressionPack {
  const changed = new Set(input.changedModules);
  const pack: RegressionPack = { p1: [], p2: [], p3: [], quarantined: [] };

  for (const test of input.tests) {
    const reasons: string[] = [];
    const h = test.history;

    // Flaky tests are quarantined regardless of anything else (§7.4) —
    // flagged separately, manually verified, never block a release.
    if (h.flaky) {
      pack.quarantined.push({ test, reasons: ['Flaky (intermittent) — quarantine or manual verify'] });
      continue;
    }

    // P1 smoke: core journeys, always run.
    if (test.smoke) {
      pack.p1.push({ test, reasons: ['P1 core user journey — runs every release'] });
      continue;
    }

    const riskScore = input.moduleRiskScores[test.module] ?? 0;
    const ddiBand = input.moduleDdiBands[test.module] ?? 'low';
    const moduleChanged = changed.has(test.module);

    // Previously-failed test rules (§7.4)
    if (h.failedInLastRelease) reasons.push('Failed in last release — always include in P2');
    else if (
      h.lastFailedReleasesAgo !== null &&
      h.lastFailedReleasesAgo >= 2 &&
      h.lastFailedReleasesAgo <= 3 &&
      moduleChanged
    ) {
      reasons.push('Failed 2–3 releases ago and area changed this release');
    }
    if (h.fixedButHighRiskArea) reasons.push('Fixed but high-risk area — confidence check');

    // Risk/change/DDI signals (§7.1, §7.2, §7.3)
    if (riskScore >= RISK_THRESHOLD_P2) reasons.push(`Module risk score ${riskScore} ≥ ${RISK_THRESHOLD_P2}`);
    if (moduleChanged) reasons.push('Module changed in this release');
    if (ddiBand === 'high') reasons.push('Module DDI high (≥2.5) — always P2, escalate to QE Lead');
    else if (ddiBand === 'medium' && moduleChanged) reasons.push('Module DDI medium (1.0–2.4) in changed area');
    if (test.tags.includes('regression') && moduleChanged) {
      reasons.push('AC scenario tagged Regression in a changed area');
    }

    // Demotion rule: stable for 6+ sprints with low DDI → P3 unless another
    // signal pulled it in (§7.4).
    const stable =
      (h.sprintsSinceLastFailure === null || h.sprintsSinceLastFailure >= 6) && ddiBand === 'low';

    if (reasons.length > 0) {
      pack.p2.push({ test, reasons });
    } else {
      pack.p3.push({
        test,
        reasons: [stable ? 'No failure in 6+ sprints, low DDI — demoted to P3' : 'No P2 signal — full-regression scope'],
      });
    }
  }

  // Major releases run the full suite: P3 includes everything not already in P1/P2.
  if (input.releaseKind === 'major') {
    for (const sel of pack.p3) sel.reasons.push('Major release — full regression triggered');
  }

  return pack;
}
