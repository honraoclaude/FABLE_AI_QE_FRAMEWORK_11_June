// Thin typed client for the QE Portal API.

export interface Story {
  id: string;
  title: string;
  type: 'feature' | 'bug' | 'tech_debt';
  status: string;
  module: string;
  priority: string | null;
  touches: string[];
  edgeCases: string[];
  jiraKey?: string | null;
}

export interface DorResult {
  score: number;
  status: 'ready' | 'conditionally_ready' | 'not_ready';
  action: string;
  gaps: { id: string; label: string; owner: string }[];
}

export interface Scenario {
  id: string;
  title: string;
  kind: string;
  gherkin: { given: string; when: string; then: string };
  testTypes: string[];
  automationCandidate: boolean;
  automationLayer: string;
  source: string;
}

export interface Risk {
  id: string;
  type: string;
  module: string;
  description: string;
  severity: number;
  likelihood: number;
  score: number;
  band: 'low' | 'medium' | 'high';
  action: string;
  status: string;
}

export interface SelectedTest {
  test: { id: string; name: string; module: string; smoke: boolean; automated: boolean };
  reasons: string[];
}

export interface RegressionPack {
  p1: SelectedTest[];
  p2: SelectedTest[];
  p3: SelectedTest[];
  quarantined: SelectedTest[];
}

export interface Scorecard {
  blocked: boolean;
  blockerFailures: string[];
  score: number;
  recommendation: 'go' | 'conditional_go' | 'high_risk_go' | 'no_go';
  approvalRequired: string;
  breakdown: { signal: string; weight: number; subScore: number; weighted: number }[];
}

export interface Metric {
  id: string;
  name: string;
  definition: string;
  value: number;
  unit: string;
  target: string;
  met: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export interface InvestCriterion {
  letter: 'I' | 'N' | 'V' | 'E' | 'S' | 'T';
  name: string;
  question: string;
  status: 'pass' | 'warn' | 'fail';
  findings: string[];
  suggestion: string | null;
}

export interface InvestAssessment {
  verdict: 'strong' | 'acceptable' | 'weak';
  summary: string;
  criteria: InvestCriterion[];
  source: 'heuristic' | 'ai';
}

export interface ActionItem {
  id: string;
  owner: 'BA' | 'Dev' | 'PO' | 'QA';
  description: string;
  severity: 'blocker' | 'attention';
  source: string;
  done: boolean;
}

export interface ThreeAmigosEvaluation {
  invest: InvestAssessment;
  actions: ActionItem[];
  openActions: number;
  ready: boolean;
  message: string;
}

export interface ProductContext {
  productName: string;
  industry: string;
  applicationType: string;
  businessProcesses: string[];
  architecture: string;
  integrations: string[];
  userBase: string;
  geographies: string;
  regulations: string[];
}

export interface RbtRisk {
  riskId: string;
  category: string;
  area: string;
  description: string;
  rootCause: string;
  businessImpact: string;
  impact: number;
  likelihood: number;
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  owner: string;
  mitigation: string;
  status: string;
}

export interface RbtFramework {
  id: string;
  createdAt: string;
  context: ProductContext;
  executiveSummary: string;
  scoringMethodology: { impactScale: string; likelihoodScale: string; formula: string; classification: string };
  risks: RbtRisk[];
  strategy: {
    level: 'low' | 'medium' | 'high' | 'critical';
    testTypes: string[];
    automationTarget: string;
    regressionScope: string;
    performance: string | null;
    security: string | null;
    exploratory: string | null;
    releaseCriteria: string;
  }[];
  matrix: { area: string; riskLevel: string; testType: string; priority: string; automationCandidate: boolean }[];
  kpis: { kpi: string; definition: string; target: string }[];
  governance: {
    reviewCadence: string[];
    stakeholders: string[];
    escalationCriteria: string[];
    entryGates: string[];
    exitGates: string[];
    releaseApproval: string[];
  };
  source: 'ai' | 'template';
}

export interface JiraSyncResult {
  fetched: number;
  created: number;
  updated: number;
  jql: string;
}

export const api = {
  stories: () => request<Story[]>('/stories'),
  jiraStatus: () => request<{ configured: boolean; jql: string | null; hint: string | null }>('/jira/status'),
  jiraSync: () => request<JiraSyncResult>('/jira/sync', { method: 'POST', body: '{}' }),
  dor: (id: string) => request<{ result: DorResult }>(`/stories/${id}/dor`),
  invest: (id: string) =>
    request<InvestAssessment>(`/stories/${id}/invest`, { method: 'POST', body: '{}' }),
  threeAmigosEvaluate: (id: string) =>
    request<ThreeAmigosEvaluation>(`/stories/${id}/three-amigos/evaluate`, { method: 'POST', body: '{}' }),
  toggleAction: (storyId: string, actionId: string) =>
    request<{ action: ActionItem; openActions: number }>(
      `/stories/${storyId}/actions/${actionId}/toggle`,
      { method: 'POST', body: '{}' },
    ),
  threeAmigosComplete: (id: string) =>
    request<{ story: Story; message: string }>(`/stories/${id}/three-amigos/complete`, {
      method: 'POST',
      body: '{}',
    }),
  threeAmigosReopen: (id: string) =>
    request<{ story: Story; message: string }>(`/stories/${id}/three-amigos/reopen`, {
      method: 'POST',
      body: '{}',
    }),
  generateAc: (id: string) =>
    request<{ source: string; scenarios: Scenario[] }>(`/stories/${id}/ac/generate`, {
      method: 'POST',
      body: '{}',
    }),
  risks: () => request<{ risks: Risk[] }>('/risks'),
  buildRegression: (changedModules: string[], releaseKind: 'standard' | 'major') =>
    request<RegressionPack>('/regression/build', {
      method: 'POST',
      body: JSON.stringify({ changedModules, releaseKind }),
    }),
  gonogo: (payload: unknown) =>
    request<Scorecard>('/gonogo', { method: 'POST', body: JSON.stringify(payload) }),
  metrics: () => request<Metric[]>('/metrics'),
  rbtGenerate: (ctx: ProductContext) =>
    request<RbtFramework>('/rbt/generate', { method: 'POST', body: JSON.stringify(ctx) }),
  rbtList: () =>
    request<{ id: string; createdAt: string; productName: string; riskCount: number; source: string }[]>('/rbt'),
  rbtGet: (id: string) => request<RbtFramework>(`/rbt/${id}`),
};
