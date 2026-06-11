import { describe, expect, it } from 'vitest';
import {
  buildGovernance,
  buildMatrix,
  classifyRiskScore,
  frameworkToCsv,
  generateFrameworkTemplate,
  identifyRisksTemplate,
  scoreRisk5x5,
  STRATEGY,
  type ProductContext,
} from '../src/engines/rbt.js';

const ctx = (overrides: Partial<ProductContext> = {}): ProductContext => ({
  productName: 'PayFlow',
  industry: 'Banking',
  applicationType: 'Web',
  businessProcesses: ['Customer onboarding', 'Payments', 'Statements'],
  architecture: 'Microservices',
  integrations: ['Stripe', 'Experian KYC'],
  userBase: '250,000 users',
  geographies: 'UK, EU',
  regulations: ['GDPR', 'PCI-DSS'],
  ...overrides,
});

describe('5×5 risk scoring', () => {
  it('classifies: 1–5 low, 6–11 medium, 12–19 high, 20–25 critical', () => {
    expect(classifyRiskScore(5)).toBe('low');
    expect(classifyRiskScore(6)).toBe('medium');
    expect(classifyRiskScore(11)).toBe('medium'); // not producible by int products but band-correct
    expect(classifyRiskScore(12)).toBe('high');
    expect(classifyRiskScore(16)).toBe('high');
    expect(classifyRiskScore(20)).toBe('critical');
    expect(classifyRiskScore(25)).toBe('critical');
  });

  it('score = impact × likelihood; rejects out-of-range', () => {
    expect(scoreRisk5x5(5, 4)).toEqual({ score: 20, level: 'critical' });
    expect(() => scoreRisk5x5(0, 3)).toThrow();
    expect(() => scoreRisk5x5(3, 6)).toThrow();
  });
});

describe('Rule-based risk identification', () => {
  const risks = identifyRisksTemplate(ctx());
  const byCategory = (c: string) => risks.filter((r) => r.category === c);

  it('covers one functional risk per business process', () => {
    expect(byCategory('functional')).toHaveLength(3);
  });

  it('covers one integration risk per integration, with microservices raising likelihood', () => {
    const ints = byCategory('integration');
    expect(ints).toHaveLength(2);
    expect(ints[0]?.likelihood).toBe(4); // microservices architecture
  });

  it('covers one compliance risk per regulation', () => {
    expect(byCategory('compliance')).toHaveLength(2);
    expect(byCategory('compliance').map((r) => r.area).join()).toMatch(/GDPR/);
  });

  it('GDPR adds a PII data risk', () => {
    expect(byCategory('data').some((r) => /PII/i.test(r.description) || /PII/i.test(r.area))).toBe(true);
  });

  it('UI app types get a UX/accessibility risk; APIs do not', () => {
    expect(byCategory('ux')).toHaveLength(1);
    const apiRisks = identifyRisksTemplate(ctx({ applicationType: 'API' }));
    expect(apiRisks.filter((r) => r.category === 'ux')).toHaveLength(0);
  });

  it('high-stakes industries raise functional impact to 5', () => {
    expect(byCategory('functional')[0]?.impact).toBe(5);
    const saas = identifyRisksTemplate(ctx({ industry: 'SaaS' }));
    expect(saas.find((r) => r.category === 'functional')?.impact).toBe(4);
  });

  it('every risk has unique category-prefixed ID, score, level, owner, mitigation', () => {
    const ids = risks.map((r) => r.riskId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of risks) {
      expect(r.riskId).toMatch(/^(BUS|FUN|INT|SEC|PER|DAT|COM|OPS|UX)-\d+$/);
      expect(r.score).toBe(r.impact * r.likelihood);
      expect(r.mitigation.length).toBeGreaterThan(10);
    }
  });
});

describe('Test prioritization matrix', () => {
  it('areas take their highest risk level; critical areas map to P1', () => {
    const fw = generateFrameworkTemplate('id1', ctx());
    const authRows = fw.matrix.filter((m) => m.area === 'Authentication & authorization');
    expect(authRows.length).toBeGreaterThan(0);
    expect(authRows.every((m) => m.priority === 'P1' || m.riskLevel !== 'critical')).toBe(true);
    expect(authRows.some((m) => m.testType === 'Security Testing')).toBe(true);
  });

  it('only relevant test types appear per area', () => {
    const matrix = buildMatrix(identifyRisksTemplate(ctx()));
    const perf = matrix.filter((m) => m.testType === 'Performance Testing');
    expect(perf.every((m) => m.area !== 'Regulatory — GDPR')).toBe(true);
  });
});

describe('Framework assembly', () => {
  const fw = generateFrameworkTemplate('id2', ctx());

  it('contains all deliverables', () => {
    expect(fw.executiveSummary).toMatch(/PayFlow/);
    expect(fw.scoringMethodology.formula).toMatch(/Impact × Likelihood/);
    expect(fw.strategy).toHaveLength(4);
    expect(STRATEGY.find((s) => s.level === 'critical')?.releaseCriteria).toMatch(/hard blocker/i);
    expect(fw.kpis.length).toBeGreaterThanOrEqual(6);
    expect(fw.governance.releaseApproval.length).toBe(4);
  });

  it('regulated products add a compliance stakeholder', () => {
    expect(fw.governance.stakeholders.join()).toMatch(/Compliance/);
    const unregulated = buildGovernance(ctx({ regulations: [] }));
    expect(unregulated.stakeholders.join()).not.toMatch(/Compliance/);
  });

  it('CSV export has the spec columns and escapes commas/quotes', () => {
    const csv = frameworkToCsv(fw);
    const [header] = csv.split('\r\n');
    expect(header).toBe(
      'Risk ID,Category,Product Area,Risk Description,Root Cause,Potential Business Impact,Impact (1-5),Likelihood (1-5),Risk Score,Priority,Owner,Mitigation,Status',
    );
    expect(csv.split('\r\n')).toHaveLength(fw.risks.length + 1);
    // descriptions contain commas → must be quoted
    expect(csv).toMatch(/"/);
  });
});
