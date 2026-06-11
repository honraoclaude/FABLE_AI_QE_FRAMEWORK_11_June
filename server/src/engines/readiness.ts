// Three Amigos readiness assessment — QE Framework §3.2
// Six criteria; each missing criterion is auto-assigned to its owner.

import type { Role } from '../types.js';

export interface ReadinessInput {
  acWrittenSpecificTestable: boolean;
  wireframesLinked: boolean;
  technicalApproachLinked: boolean;
  prioritySetAndWhyClear: boolean;
  edgeCaseCount: number;
  dependenciesLinkedOrNone: boolean;
}

export interface ReadinessGap {
  criterion: string;
  passCondition: string;
  owner: Role;
}

export interface ReadinessResult {
  ready: boolean;
  passed: number;
  total: number;
  gaps: ReadinessGap[];
}

const CRITERIA: {
  criterion: string;
  passCondition: string;
  owner: Role;
  passes: (i: ReadinessInput) => boolean;
}[] = [
  {
    criterion: 'Acceptance Criteria',
    passCondition: 'Written, specific, testable',
    owner: 'BA',
    passes: (i) => i.acWrittenSpecificTestable,
  },
  {
    criterion: 'Wireframes / Designs',
    passCondition: 'Link present and accessible',
    owner: 'BA',
    passes: (i) => i.wireframesLinked,
  },
  {
    criterion: 'Technical Approach',
    passCondition: 'Dev notes or tech design linked',
    owner: 'Dev',
    passes: (i) => i.technicalApproachLinked,
  },
  {
    criterion: 'Business Context / Priority',
    passCondition: "Priority set, 'why' is clear",
    owner: 'PO',
    passes: (i) => i.prioritySetAndWhyClear,
  },
  {
    criterion: 'Edge Cases',
    passCondition: 'At least 3 edge cases noted',
    owner: 'QA',
    passes: (i) => i.edgeCaseCount >= 3,
  },
  {
    criterion: 'Dependencies',
    passCondition: "Linked tickets or 'none' stated",
    owner: 'Dev',
    passes: (i) => i.dependenciesLinkedOrNone,
  },
];

export function assessReadiness(input: ReadinessInput): ReadinessResult {
  const gaps: ReadinessGap[] = CRITERIA.filter((c) => !c.passes(input)).map(
    ({ criterion, passCondition, owner }) => ({ criterion, passCondition, owner }),
  );
  return {
    ready: gaps.length === 0,
    passed: CRITERIA.length - gaps.length,
    total: CRITERIA.length,
    gaps,
  };
}
