import { describe, expect, it } from 'vitest';
import { generateScenariosTemplate, scoreAutomation, STANDARD_ACCESSIBILITY_AC } from '../src/engines/ac.js';
import type { Story } from '../src/types.js';

const baseStory: Story = {
  id: 's1',
  title: 'Apply discount code',
  description: 'Customers apply discount codes at checkout',
  type: 'feature',
  status: 'three_amigos_complete',
  module: 'checkout',
  priority: 'P1',
  touches: [],
  edgeCases: [],
  dorChecks: {},
  dodChecks: {},
  dodVerified: {},
  createdAt: '',
  updatedAt: '',
};

describe('AC generation — template fallback (§5.1)', () => {
  it('always produces at least one happy and one negative path', () => {
    const scenarios = generateScenariosTemplate(baseStory);
    expect(scenarios.some((s) => s.kind === 'happy')).toBe(true);
    expect(scenarios.some((s) => s.kind === 'negative')).toBe(true);
  });

  it('produces one scenario per edge case', () => {
    const scenarios = generateScenariosTemplate({
      ...baseStory,
      edgeCases: ['expired code', 'stacked codes', 'zero-value cart'],
    });
    expect(scenarios.filter((s) => s.kind === 'edge')).toHaveLength(3);
  });

  it('auto-adds security AC for stories touching auth/payments/personal data', () => {
    const scenarios = generateScenariosTemplate({ ...baseStory, touches: ['payments', 'auth'] });
    const security = scenarios.filter((s) => s.kind === 'security');
    expect(security.length).toBeGreaterThanOrEqual(4); // 2 payments + 2 auth
    expect(security.some((s) => /OWASP/.test(s.title))).toBe(true);
  });

  it('auto-adds the 5 standard accessibility AC for UI stories', () => {
    const scenarios = generateScenariosTemplate({ ...baseStory, touches: ['ui'] });
    expect(scenarios.filter((s) => s.kind === 'accessibility')).toHaveLength(STANDARD_ACCESSIBILITY_AC.length);
  });

  it('every scenario gets Gherkin, test types, and automation scoring', () => {
    for (const s of generateScenariosTemplate({ ...baseStory, touches: ['ui'], edgeCases: ['x'] })) {
      expect(s.gherkin.given).toBeTruthy();
      expect(s.gherkin.when).toBeTruthy();
      expect(s.gherkin.then).toBeTruthy();
      expect(s.testTypes.length).toBeGreaterThan(0);
      expect(['api', 'ui', 'manual']).toContain(s.automationLayer);
    }
  });
});

describe('Automation candidate scoring (§5.3)', () => {
  it('manual judgement always wins — not a candidate', () => {
    const r = scoreAutomation({
      runsEveryBuild: true,
      staticDataOrUi: true,
      requiresManualJudgement: true,
      highRegressionRisk: true,
      apiTestableWithoutUi: true,
    });
    expect(r.candidate).toBe(false);
    expect(r.layer).toBe('manual');
  });

  it('API-testable candidates prefer the API layer', () => {
    const r = scoreAutomation({
      runsEveryBuild: true,
      staticDataOrUi: true,
      requiresManualJudgement: false,
      highRegressionRisk: false,
      apiTestableWithoutUi: true,
    });
    expect(r.candidate).toBe(true);
    expect(r.layer).toBe('api');
  });

  it('UI-bound candidates fall to UI automation', () => {
    const r = scoreAutomation({
      runsEveryBuild: false,
      staticDataOrUi: false,
      requiresManualJudgement: false,
      highRegressionRisk: true,
      apiTestableWithoutUi: false,
    });
    expect(r.candidate).toBe(true);
    expect(r.layer).toBe('ui');
  });

  it('no positive signals → not a candidate', () => {
    const r = scoreAutomation({
      runsEveryBuild: false,
      staticDataOrUi: false,
      requiresManualJudgement: false,
      highRegressionRisk: false,
      apiTestableWithoutUi: false,
    });
    expect(r.candidate).toBe(false);
  });
});
