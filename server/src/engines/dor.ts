// Definition of Ready engine — QE Framework §2
// Checked twice: Gate 1 (backlog refinement, AI + gap auto-assignment) and
// Gate 2 (pre-3 Amigos, QE Lead human sign-off).

import type { Role, StoryType } from '../types.js';

export interface DorCriterion {
  id: string;
  label: string;
  /** Who fixes the gap when the criterion is missing */
  owner: Role;
}

/** Global baseline — applies to all stories (§2.2) */
export const DOR_GLOBAL_BASELINE: DorCriterion[] = [
  { id: 'title_clear', label: 'Story title is clear and unambiguous', owner: 'BA' },
  { id: 'business_value', label: "Business value / 'why' is stated", owner: 'PO' },
  { id: 'independently_deliverable', label: 'Story is independently deliverable', owner: 'BA' },
  { id: 'estimable', label: 'Story is estimable by the team', owner: 'Dev' },
  { id: 'fits_sprint', label: 'Story fits within one sprint', owner: 'BA' },
  { id: 'ac_drafted', label: 'Acceptance criteria drafted (even rough)', owner: 'BA' },
  { id: 'priority_assigned', label: 'Priority assigned by PO', owner: 'PO' },
  { id: 'dependencies_identified', label: "Dependencies identified or stated as none", owner: 'Dev' },
];

/** Story-type extensions (§2.3) */
export const DOR_EXTENSIONS: Record<StoryType, DorCriterion[]> = {
  feature: [
    { id: 'designs_linked', label: 'Wireframes / designs linked', owner: 'BA' },
    { id: 'persona_identified', label: 'User persona / affected journey identified', owner: 'BA' },
    { id: 'out_of_scope', label: 'Out of scope explicitly stated', owner: 'BA' },
    { id: 'external_deps_noted', label: 'External API or service dependencies noted', owner: 'Dev' },
    { id: 'analytics_stated', label: 'Analytics / tracking requirements stated', owner: 'PO' },
  ],
  bug: [
    { id: 'steps_to_reproduce', label: 'Steps to reproduce documented', owner: 'QA' },
    { id: 'expected_vs_actual', label: 'Expected vs actual behaviour stated', owner: 'QA' },
    { id: 'environment_noted', label: 'Environment, browser, and device noted', owner: 'QA' },
    { id: 'severity_assigned', label: 'Severity and priority assigned', owner: 'QA' },
    { id: 'evidence_attached', label: 'Screenshot / log attached', owner: 'QA' },
    { id: 'affected_version', label: 'Affected version identified', owner: 'QA' },
  ],
  tech_debt: [
    { id: 'problem_described', label: 'Current problem clearly described', owner: 'Dev' },
    { id: 'solution_outlined', label: 'Proposed solution outlined', owner: 'Dev' },
    { id: 'impact_assessed', label: 'Impact on existing functionality assessed', owner: 'Dev' },
    { id: 'effort_estimated', label: 'Estimated effort noted', owner: 'Dev' },
    { id: 'business_justification', label: 'Business justification provided', owner: 'PO' },
  ],
};

export type DorStatus = 'ready' | 'conditionally_ready' | 'not_ready';

export interface DorGap {
  id: string;
  label: string;
  owner: Role;
}

export interface DorResult {
  score: number; // 0–100, rounded
  status: DorStatus;
  action: string;
  total: number;
  passed: number;
  gaps: DorGap[];
}

export function dorChecklistFor(type: StoryType): DorCriterion[] {
  return [...DOR_GLOBAL_BASELINE, ...DOR_EXTENSIONS[type]];
}

/**
 * Score a story's DoR checks against thresholds (§2.4):
 * 100% ready · 80–99% conditionally ready (QE Lead decides) · <80% blocked.
 */
export function scoreDor(type: StoryType, checks: Record<string, boolean>): DorResult {
  const checklist = dorChecklistFor(type);
  const gaps: DorGap[] = checklist
    .filter((c) => !checks[c.id])
    .map(({ id, label, owner }) => ({ id, label, owner }));
  const passed = checklist.length - gaps.length;
  const score = Math.round((passed / checklist.length) * 100);

  let status: DorStatus;
  let action: string;
  if (score === 100) {
    status = 'ready';
    action = 'Eligible for 3 Amigos session';
  } else if (score >= 80) {
    status = 'conditionally_ready';
    action = 'Minor gaps — QE Lead decides';
  } else {
    status = 'not_ready';
    action = 'Blocked from 3 Amigos until gaps resolved';
  }

  return { score, status, action, total: checklist.length, passed, gaps };
}
