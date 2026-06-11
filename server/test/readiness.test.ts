import { describe, expect, it } from 'vitest';
import { assessReadiness, type ReadinessInput } from '../src/engines/readiness.js';

const allGood: ReadinessInput = {
  acWrittenSpecificTestable: true,
  wireframesLinked: true,
  technicalApproachLinked: true,
  prioritySetAndWhyClear: true,
  edgeCaseCount: 3,
  dependenciesLinkedOrNone: true,
};

describe('3 Amigos readiness (§3.2)', () => {
  it('passes when all 6 criteria are met', () => {
    const r = assessReadiness(allGood);
    expect(r.ready).toBe(true);
    expect(r.passed).toBe(6);
  });

  it('requires at least 3 edge cases (QA-owned)', () => {
    const r = assessReadiness({ ...allGood, edgeCaseCount: 2 });
    expect(r.ready).toBe(false);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0]?.criterion).toBe('Edge Cases');
    expect(r.gaps[0]?.owner).toBe('QA');
  });

  it('routes missing technical approach to Dev and missing priority to PO', () => {
    const r = assessReadiness({ ...allGood, technicalApproachLinked: false, prioritySetAndWhyClear: false });
    const owners = r.gaps.map((g) => g.owner);
    expect(owners).toContain('Dev');
    expect(owners).toContain('PO');
  });
});
