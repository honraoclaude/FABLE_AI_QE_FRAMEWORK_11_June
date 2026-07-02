import { describe, expect, it } from 'vitest';
import { computeLiveGonogo, type LiveGonogoInput } from '../src/engines/gonogo-live.js';
import type { Defect, Story, TestCase } from '../src/types.js';

const story = (id: string, status: Story['status'], overrides: Partial<Story> = {}): Story => ({
  id, title: id, description: '', type: 'feature', status, module: 'checkout', priority: null,
  touches: [], edgeCases: [], dorChecks: {}, dodChecks: {}, dodVerified: {}, createdAt: '', updatedAt: '', ...overrides,
});

const test = (overrides: Omit<Partial<TestCase>, 'history'> & { history?: Partial<TestCase['history']> }): TestCase => ({
  id: Math.random().toString(36).slice(2), name: 't', module: 'checkout', smoke: false, tags: [], automated: true,
  ...overrides,
  history: {
    failedInLastRelease: false, lastFailedReleasesAgo: null, flaky: false,
    fixedButHighRiskArea: false, sprintsSinceLastFailure: null, ...overrides.history,
  },
});

const defect = (severity: Defect['severity'], status: Defect['status']): Defect => ({
  id: Math.random().toString(36).slice(2), module: 'checkout', severity, title: 'd', foundIn: 'testing', status, createdAt: '',
});

const base: LiveGonogoInput = {
  stories: [story('a', 'released'), story('b', 'qe_verification')],
  defects: [],
  tests: [],
  risks: [],
  storiesWithAc: new Set(['a']),
};

describe('Auto-populated Go/No-Go (live signals)', () => {
  it('critical open defects populate the hard blocker', () => {
    const r = computeLiveGonogo({ ...base, defects: [defect('critical', 'open'), defect('critical', 'closed')] });
    expect(r.blockers.criticalBugsOpen).toBe(1);
  });

  it('PO sign-off is never auto-derived', () => {
    expect(computeLiveGonogo(base).blockers.poSignOffReceived).toBe(false);
  });

  it('P1 pass rate from smoke tests, flaky excluded', () => {
    const r = computeLiveGonogo({
      ...base,
      tests: [
        test({ smoke: true }),
        test({ smoke: true, history: { failedInLastRelease: true } }),
        test({ smoke: true, history: { flaky: true, failedInLastRelease: true } }), // quarantined — ignored
      ],
    });
    expect(r.signals.p1SmokeTests.value).toBe(50);
    expect(r.blockers.p1SmokeAllPassing).toBe(false);
  });

  it('risk register score subtracts 25 per high and 10 per medium open risk', () => {
    const r = computeLiveGonogo({
      ...base,
      risks: [
        { band: 'high', status: 'open' }, { band: 'high', status: 'mitigated' },
        { band: 'medium', status: 'open' }, { band: 'low', status: 'open' },
      ],
    });
    expect(r.signals.riskRegisterStatus.value).toBe(65);
  });

  it('AC coverage = stories with scenarios / total', () => {
    expect(computeLiveGonogo(base).signals.acCoverage.value).toBe(50);
  });

  it('signals without a data source carry an explicit caveat', () => {
    const r = computeLiveGonogo(base);
    expect(r.signals.securityScan.evidence).toMatch(/verify.*CI/i);
    expect(r.signals.performanceBudget.evidence).toMatch(/No performance results/i);
  });
});
