import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../src/engines/metrics.js';

describe('Core quality metrics (§14.1)', () => {
  const metrics = computeMetrics({
    prodBugs: 2,
    totalBugs: 50,
    bugsCaughtBeforeDev: 20,
    automatedTests: 90,
    totalTests: 100,
    avgSprintsToDetect: 0.5,
    storiesMeetingFullDod: 48,
    storiesDelivered: 50,
    flakyTests: 1,
    autoTestsThatCaughtBug: 70,
  });
  const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));

  it('escape rate: 2/50 = 4% meets <5% target', () => {
    expect(byId['escape_rate']?.value).toBe(4);
    expect(byId['escape_rate']?.met).toBe(true);
  });

  it('shift-left index: 40% beats >30% target', () => {
    expect(byId['shift_left_index']?.value).toBe(40);
    expect(byId['shift_left_index']?.met).toBe(true);
  });

  it('automation coverage: 90% beats >80% target', () => {
    expect(byId['automation_coverage']?.met).toBe(true);
  });

  it('DoD compliance: 96% beats >95% target', () => {
    expect(byId['dod_compliance']?.value).toBe(96);
    expect(byId['dod_compliance']?.met).toBe(true);
  });

  it('flakiness 1% meets <2%; ROI 77.8% beats >70%', () => {
    expect(byId['flakiness']?.met).toBe(true);
    expect(byId['automation_roi']?.value).toBeCloseTo(77.8, 1);
    expect(byId['automation_roi']?.met).toBe(true);
  });

  it('zero denominators do not divide by zero', () => {
    const empty = computeMetrics({
      prodBugs: 0, totalBugs: 0, bugsCaughtBeforeDev: 0, automatedTests: 0, totalTests: 0,
      avgSprintsToDetect: 0, storiesMeetingFullDod: 0, storiesDelivered: 0, flakyTests: 0,
      autoTestsThatCaughtBug: 0,
    });
    for (const m of empty) expect(Number.isFinite(m.value)).toBe(true);
  });
});
