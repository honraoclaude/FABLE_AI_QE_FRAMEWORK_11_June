// Definition of Done engine — QE Framework §4
// Tailored DoD per story type; dual verification:
//   Stage 1 — Dev self-certifies all Dev-owned items before raising a PR.
//   Stage 2 — QE independently verifies every item; any failure blocks release.

import type { StoryType } from '../types.js';

export type DodOwner = 'dev' | 'qa' | 'po';

export interface DodItem {
  id: string;
  label: string;
  owner: DodOwner;
}

/** Global baseline — all stories (§4.1) */
export const DOD_GLOBAL_BASELINE: DodItem[] = [
  { id: 'code_reviewed', label: 'Code reviewed and approved (min 1 peer reviewer)', owner: 'dev' },
  { id: 'ac_passing', label: 'All AC scenarios passing', owner: 'qa' },
  { id: 'no_crit_high_bugs', label: 'No critical or high severity bugs open', owner: 'qa' },
  { id: 'unit_tests', label: 'Unit tests written and passing', owner: 'dev' },
  { id: 'docs_updated', label: 'Relevant documentation updated', owner: 'dev' },
  { id: 'feature_flag', label: 'Feature flag configured (if applicable)', owner: 'dev' },
  { id: 'deployed_staging', label: 'Deployed to staging environment', owner: 'dev' },
  { id: 'qe_signoff', label: 'QE sign-off received', owner: 'qa' },
];

/** Story-type extensions (§4.2) */
export const DOD_EXTENSIONS: Record<StoryType, DodItem[]> = {
  feature: [
    { id: 'gherkin_passing', label: 'All Gherkin AC scenarios passing', owner: 'qa' },
    { id: 'ui_automation', label: 'UI automation tests written for automation candidates', owner: 'qa' },
    { id: 'api_automation', label: 'API tests written for API automation candidates', owner: 'qa' },
    { id: 'accessibility', label: 'Accessibility check passed (WCAG 2.1 AA)', owner: 'qa' },
    { id: 'perf_budget', label: 'Performance budget not exceeded', owner: 'dev' },
    { id: 'cross_browser', label: 'Cross-browser tested (defined browser matrix)', owner: 'qa' },
    { id: 'risk_register_updated', label: 'Risk Register updated for new risks introduced', owner: 'qa' },
    { id: 'regression_pack_updated', label: 'Regression pack updated with new regression scenarios', owner: 'qa' },
    { id: 'po_demo', label: 'PO demo completed and signed off', owner: 'po' },
  ],
  bug: [
    { id: 'root_cause', label: 'Root cause documented in Jira', owner: 'dev' },
    { id: 'fix_verified', label: 'Fix verified against original defect steps', owner: 'qa' },
    { id: 'regression_test_added', label: 'Regression test written to prevent recurrence', owner: 'qa' },
    { id: 'related_smoke', label: 'Related areas smoke tested (defect density check)', owner: 'qa' },
    { id: 'ddi_updated', label: 'Defect Density Index updated for affected module', owner: 'qa' },
    { id: 'failed_register_updated', label: 'Previously Failed Test Register updated', owner: 'qa' },
    { id: 'no_new_defects', label: 'No new defects introduced in fix', owner: 'qa' },
  ],
  tech_debt: [
    { id: 'tech_approach_documented', label: 'Technical approach documented', owner: 'dev' },
    { id: 'no_regression', label: 'No regression in existing functionality', owner: 'qa' },
    { id: 'perf_maintained', label: 'Performance benchmarks maintained or improved', owner: 'dev' },
    { id: 'coverage_maintained', label: 'Code coverage maintained or improved', owner: 'dev' },
    { id: 'adr_updated', label: 'Architecture decision record (ADR) updated if applicable', owner: 'dev' },
    { id: 'risk_if_new_debt', label: 'Risk Register updated if debt introduced new risk', owner: 'qa' },
  ],
};

export function dodChecklistFor(type: StoryType): DodItem[] {
  return [...DOD_GLOBAL_BASELINE, ...DOD_EXTENSIONS[type]];
}

export interface SelfCertResult {
  complete: boolean;
  missing: DodItem[];
  message: string;
}

/** Stage 1 — Dev cannot submit for QE review until all Dev-owned items are checked. */
export function devSelfCertify(type: StoryType, checks: Record<string, boolean>): SelfCertResult {
  const devItems = dodChecklistFor(type).filter((i) => i.owner === 'dev');
  const missing = devItems.filter((i) => !checks[i.id]);
  return {
    complete: missing.length === 0,
    missing,
    message:
      missing.length === 0
        ? 'Dev self-certification complete — story may proceed to QE verification'
        : `Cannot submit for QE review: ${missing.length} Dev-owned DoD item(s) incomplete`,
  };
}

export interface QeVerifyResult {
  passed: boolean;
  unverified: DodItem[];
  message: string;
}

/**
 * Stage 2 — QE independently verifies every item (not just QA-owned ones).
 * Any failed item blocks the story from Ready for Release.
 */
export function qeVerify(type: StoryType, verified: Record<string, boolean>): QeVerifyResult {
  const items = dodChecklistFor(type);
  const unverified = items.filter((i) => !verified[i.id]);
  return {
    passed: unverified.length === 0,
    unverified,
    message:
      unverified.length === 0
        ? 'QE verification passed — story is Ready for Release'
        : `Blocked from Ready for Release: ${unverified.length} DoD item(s) failed independent verification`,
  };
}
