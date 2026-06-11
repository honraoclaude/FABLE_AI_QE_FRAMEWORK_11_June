import { describe, expect, it } from 'vitest';
import { buildRegressionPack, type RegressionInputs } from '../src/engines/regression.js';
import type { TestCase } from '../src/types.js';

let n = 0;
function tc(
  overrides: Omit<Partial<TestCase>, 'history'> & { history?: Partial<TestCase['history']> },
): TestCase {
  return {
    id: `t${++n}`,
    name: overrides.name ?? `test ${n}`,
    module: overrides.module ?? 'general',
    smoke: overrides.smoke ?? false,
    tags: overrides.tags ?? [],
    automated: overrides.automated ?? true,
    history: {
      failedInLastRelease: false,
      lastFailedReleasesAgo: null,
      flaky: false,
      fixedButHighRiskArea: false,
      sprintsSinceLastFailure: null,
      ...overrides.history,
    },
  };
}

function build(tests: TestCase[], overrides: Partial<RegressionInputs> = {}) {
  return buildRegressionPack({
    tests,
    moduleRiskScores: {},
    moduleDdiBands: {},
    changedModules: [],
    releaseKind: 'standard',
    ...overrides,
  });
}

describe('Risk-based regression pack (§7)', () => {
  it('smoke tests always land in P1', () => {
    const pack = build([tc({ smoke: true }), tc({})]);
    expect(pack.p1).toHaveLength(1);
    expect(pack.p3).toHaveLength(1);
  });

  it('flaky tests are quarantined and never block — even smoke-tagged ones', () => {
    const pack = build([tc({ smoke: true, history: { flaky: true } })]);
    expect(pack.quarantined).toHaveLength(1);
    expect(pack.p1).toHaveLength(0);
  });

  it('failed in last release → always P2', () => {
    const pack = build([tc({ history: { failedInLastRelease: true } })]);
    expect(pack.p2).toHaveLength(1);
    expect(pack.p2[0]?.reasons.join()).toMatch(/Failed in last release/);
  });

  it('failed 2–3 releases ago → P2 only if area changed this release', () => {
    const test = () => tc({ module: 'checkout', history: { lastFailedReleasesAgo: 2 } });
    expect(build([test()], { changedModules: ['checkout'] }).p2).toHaveLength(1);
    expect(build([test()], { changedModules: [] }).p2).toHaveLength(0);
  });

  it('module risk score ≥6 pulls tests into P2', () => {
    const pack = build([tc({ module: 'auth' })], { moduleRiskScores: { auth: 8 } });
    expect(pack.p2).toHaveLength(1);
  });

  it('risk score <6 alone does not pull into P2', () => {
    const pack = build([tc({ module: 'auth' })], { moduleRiskScores: { auth: 4 } });
    expect(pack.p2).toHaveLength(0);
  });

  it('high DDI module → always P2', () => {
    const pack = build([tc({ module: 'checkout' })], { moduleDdiBands: { checkout: 'high' } });
    expect(pack.p2).toHaveLength(1);
  });

  it('medium DDI counts only in changed areas', () => {
    const test = () => tc({ module: 'checkout' });
    expect(
      build([test()], { moduleDdiBands: { checkout: 'medium' }, changedModules: ['checkout'] }).p2,
    ).toHaveLength(1);
    expect(build([test()], { moduleDdiBands: { checkout: 'medium' } }).p2).toHaveLength(0);
  });

  it('regression-tagged AC in changed area → P2', () => {
    const pack = build([tc({ module: 'checkout', tags: ['regression'] })], { changedModules: ['checkout'] });
    expect(pack.p2).toHaveLength(1);
  });

  it('fixed-but-high-risk area → P2 confidence check', () => {
    const pack = build([tc({ history: { fixedButHighRiskArea: true } })]);
    expect(pack.p2[0]?.reasons.join()).toMatch(/confidence check/);
  });

  it('stable 6+ sprints with low DDI → demoted to P3', () => {
    const pack = build([tc({ history: { sprintsSinceLastFailure: 9 } })]);
    expect(pack.p3).toHaveLength(1);
    expect(pack.p3[0]?.reasons.join()).toMatch(/demoted to P3/);
  });
});
