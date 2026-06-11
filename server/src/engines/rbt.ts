// Risk-Based Testing framework generator.
// From a product context, produces the full QE risk-management deliverable:
// categorized risk identification (9 categories), a 5×5 impact × likelihood
// scoring model with Low/Medium/High/Critical classification, a product risk
// register, a per-level risk-based test strategy, a test prioritization
// matrix, release dashboard KPIs, and a governance model — exportable as CSV
// for Jira / Azure DevOps / Excel.
//
// This is the deterministic rule-based path; ai/claude.ts can replace the
// risk identification + executive summary with context-specific AI output.

export interface ProductContext {
  productName: string;
  industry: string; // Banking / Insurance / Retail / Healthcare / Telecom / SaaS / ...
  applicationType: string; // Web / Mobile / API / Microservices / Data Platform
  businessProcesses: string[];
  architecture: string; // Microservices / Monolith / Cloud Native / Hybrid
  integrations: string[];
  userBase: string;
  geographies: string;
  regulations: string[]; // GDPR, PCI-DSS, HIPAA, SOX, ...
}

export type RiskCategory =
  | 'business'
  | 'functional'
  | 'integration'
  | 'security'
  | 'performance'
  | 'data'
  | 'compliance'
  | 'operational'
  | 'ux';

export const RISK_CATEGORY_LABELS: Record<RiskCategory, string> = {
  business: 'Business',
  functional: 'Functional',
  integration: 'Integration',
  security: 'Security',
  performance: 'Performance',
  data: 'Data',
  compliance: 'Compliance',
  operational: 'Operational',
  ux: 'User Experience',
};

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface IdentifiedRisk {
  riskId: string; // e.g. SEC-1
  category: RiskCategory;
  area: string; // product area
  description: string;
  rootCause: string;
  businessImpact: string;
  impact: number; // 1–5 (financial / customer / regulatory / brand)
  likelihood: number; // 1–5 (defect trends / complexity / change frequency / dependency exposure)
  score: number; // impact × likelihood
  level: RiskLevel;
  owner: 'PO' | 'BA' | 'Dev' | 'QA' | 'QE Lead' | 'Release Manager';
  mitigation: string;
  status: 'open';
}

export interface StrategyLevel {
  level: RiskLevel;
  testTypes: string[];
  automationTarget: string;
  regressionScope: string;
  performance: string | null;
  security: string | null;
  exploratory: string | null;
  releaseCriteria: string;
}

export interface MatrixRow {
  area: string;
  riskLevel: RiskLevel;
  testType: string;
  priority: 'P1' | 'P2' | 'P3';
  automationCandidate: boolean;
}

export interface DashboardKpi {
  kpi: string;
  definition: string;
  target: string;
}

export interface Governance {
  reviewCadence: string[];
  stakeholders: string[];
  escalationCriteria: string[];
  entryGates: string[];
  exitGates: string[];
  releaseApproval: string[];
}

export interface RbtFramework {
  id: string;
  createdAt: string;
  context: ProductContext;
  executiveSummary: string;
  scoringMethodology: {
    impactScale: string;
    likelihoodScale: string;
    formula: string;
    classification: string;
  };
  risks: IdentifiedRisk[];
  strategy: StrategyLevel[];
  matrix: MatrixRow[];
  kpis: DashboardKpi[];
  governance: Governance;
  source: 'ai' | 'template';
}

// ---------------------------------------------------------------------------
// Scoring — 5×5 model
// ---------------------------------------------------------------------------

export function classifyRiskScore(score: number): RiskLevel {
  if (score >= 20) return 'critical';
  if (score >= 12) return 'high';
  if (score >= 6) return 'medium';
  return 'low';
}

export function scoreRisk5x5(impact: number, likelihood: number): { score: number; level: RiskLevel } {
  if (
    !Number.isInteger(impact) || !Number.isInteger(likelihood) ||
    impact < 1 || impact > 5 || likelihood < 1 || likelihood > 5
  ) {
    throw new Error('impact and likelihood must be integers 1–5');
  }
  const score = impact * likelihood;
  return { score, level: classifyRiskScore(score) };
}

const SCORING_METHODOLOGY = {
  impactScale:
    'Impact 1–5, assessed across financial impact, customer impact, regulatory impact, and brand/reputation impact — take the highest applicable dimension',
  likelihoodScale:
    'Likelihood 1–5, assessed from historical defect trends, technical complexity, change frequency, and dependency exposure',
  formula: 'Risk Score = Impact × Likelihood (1–25)',
  classification: 'Low 1–5 · Medium 6–11 · High 12–19 · Critical 20–25',
};

// ---------------------------------------------------------------------------
// Rule-based risk identification (template path)
// ---------------------------------------------------------------------------

const HIGH_STAKES_INDUSTRY = /bank|insur|health|fintech|payment/i;

interface RiskSeed {
  category: RiskCategory;
  area: string;
  description: string;
  rootCause: string;
  businessImpact: string;
  impact: number;
  likelihood: number;
  owner: IdentifiedRisk['owner'];
  mitigation: string;
}

function buildRisk(seed: RiskSeed, counters: Map<RiskCategory, number>): IdentifiedRisk {
  const n = (counters.get(seed.category) ?? 0) + 1;
  counters.set(seed.category, n);
  const prefix: Record<RiskCategory, string> = {
    business: 'BUS', functional: 'FUN', integration: 'INT', security: 'SEC',
    performance: 'PER', data: 'DAT', compliance: 'COM', operational: 'OPS', ux: 'UX',
  };
  const { score, level } = scoreRisk5x5(seed.impact, seed.likelihood);
  return { riskId: `${prefix[seed.category]}-${n}`, ...seed, score, level, status: 'open' };
}

export function identifyRisksTemplate(ctx: ProductContext): IdentifiedRisk[] {
  const counters = new Map<RiskCategory, number>();
  const seeds: RiskSeed[] = [];
  const highStakes = HIGH_STAKES_INDUSTRY.test(ctx.industry);
  const processes = ctx.businessProcesses.filter(Boolean);
  const integrations = ctx.integrations.filter(Boolean);
  const regs = ctx.regulations.filter(Boolean);
  const isMicroservices = /micro/i.test(ctx.architecture) || /micro/i.test(ctx.applicationType);
  const hasUi = /web|mobile/i.test(ctx.applicationType);

  // Business — revenue/operations criticality of the primary process
  if (processes[0]) {
    seeds.push({
      category: 'business',
      area: processes[0],
      description: `Outage or defect in "${processes[0]}" halts the primary business outcome`,
      rootCause: 'Single revenue-critical flow with concentrated business dependency',
      businessImpact: 'Direct revenue loss, SLA breaches, customer churn during downtime',
      impact: 5,
      likelihood: 2,
      owner: 'PO',
      mitigation: 'P1 smoke coverage on the full journey, feature-flagged rollout, tested rollback < 15 min',
    });
  }

  // Functional — one per key business process
  for (const p of processes) {
    seeds.push({
      category: 'functional',
      area: p,
      description: `Incorrect behaviour in "${p}" business rules or workflow states`,
      rootCause: 'Complex/changing business rules; edge cases not captured in AC',
      businessImpact: 'Wrong outcomes for users, manual rework, support load',
      impact: highStakes ? 5 : 4,
      likelihood: 3,
      owner: 'QA',
      mitigation: 'Gherkin AC per rule incl. negative paths; automated functional regression per change',
    });
  }

  // Integration — one per named integration
  for (const i of integrations) {
    seeds.push({
      category: 'integration',
      area: i,
      description: `Failure, latency, or contract drift in the ${i} integration`,
      rootCause: isMicroservices
        ? 'Distributed service boundaries; independently deployed contracts'
        : 'External dependency outside the team’s release control',
      businessImpact: 'Broken downstream journeys, data mismatches, queued/lost transactions',
      impact: 4,
      likelihood: isMicroservices ? 4 : 3,
      owner: 'Dev',
      mitigation: 'Contract tests in CI, timeout/retry/circuit-breaker validation, sandbox integration suite',
    });
  }

  // Security
  seeds.push({
    category: 'security',
    area: 'Authentication & authorization',
    description: 'Broken access control or authentication bypass (OWASP A01/A07)',
    rootCause: 'Role/permission complexity; session and token handling errors',
    businessImpact: 'Account takeover, data breach, regulatory penalties, brand damage',
    impact: 5,
    likelihood: highStakes ? 3 : 2,
    owner: 'QE Lead',
    mitigation: 'SAST per PR + DAST per release, authz test matrix per role, pen test before major releases',
  });
  if (hasUi || /api/i.test(ctx.applicationType)) {
    seeds.push({
      category: 'security',
      area: 'Input handling',
      description: 'Injection or unsafe input handling at user/API boundaries (OWASP A03)',
      rootCause: 'Unvalidated input paths across many endpoints/forms',
      businessImpact: 'Data exposure or corruption, service compromise',
      impact: 5,
      likelihood: 2,
      owner: 'QE Lead',
      mitigation: 'Negative-path AC at every boundary, SAST rules for injection, parameterised queries enforced',
    });
  }

  // Performance
  seeds.push({
    category: 'performance',
    area: processes[0] ?? 'Core journeys',
    description: 'Degradation under peak load on high-traffic journeys',
    rootCause: `No load baseline for ${ctx.userBase || 'the stated user base'}; hotspots untested`,
    businessImpact: 'Timeouts and abandonment during peak periods; SLA breaches',
    impact: 4,
    likelihood: 3,
    owner: 'Dev',
    mitigation: 'Performance budget per release (Lighthouse/load tests), baseline + trend tracking, soak test pre-major-release',
  });

  // Data
  seeds.push({
    category: 'data',
    area: 'Data integrity',
    description: 'Data loss, duplication, or corruption across writes, migrations, and syncs',
    rootCause: 'Concurrent updates, migration scripts, eventual consistency between stores',
    businessImpact: 'Incorrect records, reconciliation cost, loss of user trust',
    impact: 4,
    likelihood: 3,
    owner: 'QA',
    mitigation: 'Data-validation test pack, migration dry-runs against prod-like volume, reconciliation checks',
  });
  if (regs.some((r) => /gdpr|ccpa|privacy/i.test(r))) {
    seeds.push({
      category: 'data',
      area: 'Personal data (PII)',
      description: 'PII present in non-production environments or logs',
      rootCause: 'Prod-cloned test data without masking; verbose logging',
      businessImpact: 'GDPR exposure — fines up to 4% of global turnover; mandatory breach disclosure',
      impact: 5,
      likelihood: 2,
      owner: 'QE Lead',
      mitigation: 'Synthetic data generation, masking on any prod clone, test-data access audit log',
    });
  }

  // Compliance — one per stated regulation
  for (const reg of regs) {
    seeds.push({
      category: 'compliance',
      area: `Regulatory — ${reg}`,
      description: `Release ships a change that violates ${reg} requirements`,
      rootCause: `${reg} controls not encoded as testable acceptance criteria`,
      businessImpact: 'Fines, audit findings, licence/processing restrictions',
      impact: 5,
      likelihood: 2,
      owner: 'QE Lead',
      mitigation: `${reg} checklist mapped to AC for affected stories; compliance sign-off as a release gate`,
    });
  }

  // Operational
  seeds.push({
    category: 'operational',
    area: 'Release & deployment',
    description: 'Failed or partial deployment without a tested rollback path',
    rootCause: 'Environment drift; rollback rehearsed rarely; config/flag mistakes',
    businessImpact: 'Extended outage during release windows; emergency hotfixes',
    impact: 3,
    likelihood: 3,
    owner: 'Release Manager',
    mitigation: 'Environment health check pre-run, rollback tested in staging each release, flag cleanup dates',
  });

  // UX (incl. accessibility) for user-facing apps
  if (hasUi) {
    seeds.push({
      category: 'ux',
      area: 'Accessibility & usability',
      description: 'WCAG 2.1 AA violations or unusable journeys for keyboard/screen-reader users',
      rootCause: 'Accessibility treated as an afterthought rather than AC',
      businessImpact: 'Legal exposure, excluded users, brand damage',
      impact: regs.length > 0 || highStakes ? 4 : 3,
      likelihood: 3,
      owner: 'BA',
      mitigation: 'axe-core per PR in CI, accessibility AC auto-added to UI stories, audit on complex UI',
    });
  }

  return seeds.map((s) => buildRisk(s, counters));
}

// ---------------------------------------------------------------------------
// Risk-based test strategy per level
// ---------------------------------------------------------------------------

export const STRATEGY: StrategyLevel[] = [
  {
    level: 'critical',
    testTypes: ['Unit', 'Functional', 'API', 'Integration', 'E2E', 'Security (SAST + DAST)', 'Performance', 'Data validation', 'Accessibility (if UI)'],
    automationTarget: '≥ 95% of repeatable scenarios automated; all in CI per build',
    regressionScope: 'Always in P1 smoke + P2 risk-based pack — runs every release',
    performance: 'Load + stress against agreed SLAs before every release touching the area; soak test pre-major-release',
    security: 'SAST per PR, DAST per release, authz matrix per role; pen test before major releases',
    exploratory: 'Charter-based session every sprint the area changes',
    releaseCriteria: '100% critical-risk tests passing, zero open critical/high defects, security scan clean — hard blockers',
  },
  {
    level: 'high',
    testTypes: ['Functional', 'API', 'Integration', 'E2E (key journeys)', 'Targeted security'],
    automationTarget: '≥ 85% automated; runs in CI nightly and per release',
    regressionScope: 'Included in P2 risk-based pack whenever the area or its dependencies change',
    performance: 'Performance budget asserted per release (no dedicated load run unless changed)',
    security: 'SAST per PR; DAST findings triaged before release',
    exploratory: 'Charter-based session when the area changes',
    releaseCriteria: 'All high-risk tests passing or failures triaged and explicitly accepted by QE Lead + PO',
  },
  {
    level: 'medium',
    testTypes: ['Functional', 'API where applicable', 'Regression-tagged AC'],
    automationTarget: '≥ 70% automated over time; prioritise repeatable, stable scenarios',
    regressionScope: 'P2 only when directly changed; otherwise P3 full-regression scope',
    performance: null,
    security: null,
    exploratory: 'Time-boxed exploratory charter (30–60 min) per significant change',
    releaseCriteria: 'No open high-severity defects in the area',
  },
  {
    level: 'low',
    testTypes: ['Smoke-level validation', 'Existing automated regression'],
    automationTarget: 'Maintain existing automation only — no new investment unless risk rises',
    regressionScope: 'P3 full regression (pre-major release or quarterly) unless directly changed',
    performance: null,
    security: null,
    exploratory: null,
    releaseCriteria: 'Minimal validation — covered by suite health and quarterly P3 run',
  },
];

// ---------------------------------------------------------------------------
// Test prioritization matrix
// ---------------------------------------------------------------------------

const TEST_TYPE_RELEVANCE: { testType: string; categories: RiskCategory[]; automatable: boolean }[] = [
  { testType: 'Functional Testing', categories: ['business', 'functional', 'ux'], automatable: true },
  { testType: 'API Testing', categories: ['functional', 'integration', 'data', 'security'], automatable: true },
  { testType: 'Integration Testing', categories: ['integration', 'operational'], automatable: true },
  { testType: 'End-to-End Testing', categories: ['business', 'functional', 'integration'], automatable: true },
  { testType: 'Security Testing', categories: ['security', 'compliance'], automatable: true },
  { testType: 'Performance Testing', categories: ['performance', 'business'], automatable: true },
  { testType: 'Accessibility Testing', categories: ['ux', 'compliance'], automatable: true },
  { testType: 'Data Validation Testing', categories: ['data', 'compliance'], automatable: true },
];

const LEVEL_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function buildMatrix(risks: IdentifiedRisk[]): MatrixRow[] {
  // Aggregate: per area, the highest risk level and the categories present.
  const areas = new Map<string, { level: RiskLevel; categories: Set<RiskCategory> }>();
  for (const r of risks) {
    const entry = areas.get(r.area) ?? { level: r.level, categories: new Set<RiskCategory>() };
    if (LEVEL_RANK[r.level] > LEVEL_RANK[entry.level]) entry.level = r.level;
    entry.categories.add(r.category);
    areas.set(r.area, entry);
  }

  const rows: MatrixRow[] = [];
  for (const [area, { level, categories }] of areas) {
    for (const t of TEST_TYPE_RELEVANCE) {
      if (!t.categories.some((c) => categories.has(c))) continue;
      const priority: MatrixRow['priority'] =
        level === 'critical' ? 'P1' : level === 'high' ? 'P2' : level === 'medium' ? 'P2' : 'P3';
      rows.push({
        area,
        riskLevel: level,
        testType: t.testType,
        priority: level === 'medium' && !['Functional Testing', 'API Testing'].includes(t.testType) ? 'P3' : priority,
        automationCandidate: t.automatable,
      });
    }
  }
  return rows.sort((a, b) => LEVEL_RANK[b.riskLevel] - LEVEL_RANK[a.riskLevel] || a.area.localeCompare(b.area));
}

// ---------------------------------------------------------------------------
// Dashboard KPIs + governance
// ---------------------------------------------------------------------------

export const RBT_KPIS: DashboardKpi[] = [
  { kpi: 'Risk Coverage %', definition: 'Identified risks with at least one mapped, executed test', target: '≥ 95%' },
  { kpi: 'Critical Risk Test Pass Rate', definition: 'Pass rate of tests mapped to critical risks in the latest run', target: '100% (hard blocker)' },
  { kpi: 'Defect Leakage Rate', definition: 'Production defects ÷ total defects per release', target: '< 5%' },
  { kpi: 'Open High-Risk Defects', definition: 'Open defects in critical/high risk areas at release time', target: '0 at go/no-go' },
  { kpi: 'Risk Burndown Trend', definition: 'Sum of open risk scores over time', target: 'Decreasing sprint over sprint' },
  { kpi: 'Release Readiness Score', definition: 'Weighted go/no-go scorecard (P1/P2/DoD/risk/AC/DDI/security/perf)', target: '≥ 90 for unconditional GO' },
];

export function buildGovernance(ctx: ProductContext): Governance {
  const regulated = ctx.regulations.filter(Boolean).length > 0;
  return {
    reviewCadence: [
      'Per sprint: risk register review in refinement — new stories assessed, scores re-validated',
      'Per release: risk-based regression pack build + go/no-go scorecard review',
      'Monthly: retrospective on escapes, over-testing, and automation ROI',
      'Quarterly: full framework review — scoring weights recalibrated against actual outcomes',
    ],
    stakeholders: [
      'QE Lead — owns the register, validates scores, go/no-go sign-off',
      'PO — business impact ratings, priority, business-risk ownership',
      'Dev Lead — technical likelihood ratings, dependency and integration risks',
      'QA — mitigation execution, regression ownership, test evidence',
      'Release Manager — operational risks, rollback readiness, final release approval',
      ...(regulated ? ['Compliance/Security officer — regulatory risk sign-off'] : []),
    ],
    escalationCriteria: [
      'Any new risk scoring Critical (≥20) — immediate QE Lead + PO notification, mitigation within one sprint',
      'High risk (12–19) open beyond 2 sprints — escalate to leadership review',
      'Critical-risk test failure in a release window — release blocked pending triage',
      'Defect leakage above 5% for two consecutive releases — framework recalibration triggered',
    ],
    entryGates: [
      'Story DoR passed (100% or QE-Lead-approved conditional)',
      'Risk assessment attached to every story entering a sprint',
      '3 Amigos complete with all evaluator actions resolved',
    ],
    exitGates: [
      'DoD dual verification passed (Dev self-cert + independent QE)',
      'Risk-based regression pack executed for the release scope',
      'No open critical defects; security scan clean',
    ],
    releaseApproval: [
      'Score ≥ 90: GO — QE Lead sign-off',
      'Score 75–89: Conditional GO — QE Lead + PO + Release Manager',
      'Score 50–74: High-risk GO — all stakeholders approve explicitly',
      'Score < 50 or any hard blocker: NO GO — release deferred',
    ],
  };
}

// ---------------------------------------------------------------------------
// Assembly + executive summary + CSV export
// ---------------------------------------------------------------------------

export function buildExecutiveSummary(ctx: ProductContext, risks: IdentifiedRisk[]): string {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 } as Record<RiskLevel, number>;
  for (const r of risks) counts[r.level]++;
  const regs = ctx.regulations.filter(Boolean);
  return (
    `${ctx.productName || 'The product'} (${ctx.industry || 'unspecified industry'}, ${ctx.applicationType || 'application'}) ` +
    `was assessed across 9 risk categories: ${risks.length} risks identified — ` +
    `${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low. ` +
    `Testing investment is allocated by risk: critical/high areas get automated-first coverage in the P1/P2 packs ` +
    `with hard release gates; medium/low areas rely on targeted regression and exploratory charters. ` +
    (regs.length > 0
      ? `Regulatory scope (${regs.join(', ')}) makes compliance and data-protection risks release-blocking. `
      : '') +
    `Release decisions flow through the weighted go/no-go scorecard with zero-critical-defect and clean-security-scan hard blockers.`
  );
}

export function assembleFramework(
  id: string,
  ctx: ProductContext,
  risks: IdentifiedRisk[],
  executiveSummary: string,
  source: 'ai' | 'template',
): RbtFramework {
  return {
    id,
    createdAt: new Date().toISOString(),
    context: ctx,
    executiveSummary,
    scoringMethodology: SCORING_METHODOLOGY,
    risks,
    strategy: STRATEGY,
    matrix: buildMatrix(risks),
    kpis: RBT_KPIS,
    governance: buildGovernance(ctx),
    source,
  };
}

export function generateFrameworkTemplate(id: string, ctx: ProductContext): RbtFramework {
  const risks = identifyRisksTemplate(ctx);
  return assembleFramework(id, ctx, risks, buildExecutiveSummary(ctx, risks), 'template');
}

const csvEscape = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Risk register as CSV — importable into Jira, Azure DevOps, or Excel. */
export function frameworkToCsv(fw: RbtFramework): string {
  const header = [
    'Risk ID', 'Category', 'Product Area', 'Risk Description', 'Root Cause',
    'Potential Business Impact', 'Impact (1-5)', 'Likelihood (1-5)', 'Risk Score',
    'Priority', 'Owner', 'Mitigation', 'Status',
  ];
  const rows = fw.risks.map((r) =>
    [
      r.riskId, RISK_CATEGORY_LABELS[r.category], r.area, r.description, r.rootCause,
      r.businessImpact, r.impact, r.likelihood, r.score,
      r.level.toUpperCase(), r.owner, r.mitigation, r.status,
    ].map(csvEscape).join(','),
  );
  return [header.join(','), ...rows].join('\r\n');
}
