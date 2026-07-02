// Client for the Product Owner / Backlog Intelligence Hub API.

export type StoryType = 'FIX' | 'BUILD' | 'COMPLY' | 'ENHANCE';
export type Readiness = 'Sprint Ready' | 'Needs Refinement' | 'Blocked';

export interface ScoredStory {
  id: string;
  epic: string;
  title: string;
  userStory: string;
  businessValue: string;
  stakeholderOutcome: string;
  invest: { I: number; N: number; V: number; E: number; S: number; T: number };
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
  regulated: boolean;
  acCount: number;
  dependencies: string[];
  storyType: StoryType;
  outcome: string;
  health: number;
  riceScore: number;
  status: Readiness;
  statusColor: string;
  priority: number;
  rank: number;
  dorChecks: Record<string, boolean>;
  dorScore: number;
  dorStatus: string;
  dorColor: string;
  typeColor: string;
  votes: { ops: number; leadership: number; engineering: number };
  conflictIdx: number;
  tensionPos: number;
}

export interface Outcome {
  id: string;
  label: string;
  color: string;
  target: string;
  current: string;
  unit: string;
}

export interface BacklogSummary {
  total: number;
  ready: number;
  refine: number;
  blocked: number;
  regulatedCount: number;
  avgHealth: number;
  topRice: number;
  dorReady: number;
  fixCount: number;
  buildCount: number;
  complyCount: number;
  enhanceCount: number;
  avgConflict: number;
  outcomeCoverage: Record<string, number>;
}

export interface Backlog {
  stories: ScoredStory[];
  summary: BacklogSummary;
  outcomes: Outcome[];
  source: 'jira' | 'sample';
  syncedAt: string | null;
}

export interface TrendPoint {
  takenAt: string;
  trigger: string;
  source: 'sample' | 'jira';
  total: number;
  ready: number;
  refine: number;
  blocked: number;
  avgHealth: number;
  dorReady: number;
  regulatedCount: number;
  avgConflict: number;
  totalRice: number;
  readinessPct: number;
}

export interface Trends {
  points: TrendPoint[];
  deltas: Record<string, number> | null;
}

export interface StoryDrift {
  id: string;
  firstSeen: string;
  snapshotsObserved: number;
  initialHealth: number;
  latestHealth: number;
  healthDelta: number;
  initialStatus: string;
  latestStatus: string;
  stuckInRefinement: boolean;
  delivered: boolean | null;
}

export interface PredictionReport {
  snapshots: number;
  spanDays: number;
  stories: StoryDrift[];
  summary: { improved: number; degraded: number; unchanged: number; stuckInRefinement: number; avgHealthDelta: number };
  recalibrationHints: string[];
  note: string | null;
}

export interface ComplexityFinding {
  storyId: string;
  complexityScore: number;
  redFlags: string[];
  reasoning: string;
}

export interface CopilotMessage {
  role: 'user' | 'assistant';
  content: string;
  toolTrace?: { tool: string; input: Record<string, unknown> }[];
}

export interface JiraPoStatus {
  configured: boolean;
  jql: string | null;
  source: 'jira' | 'sample';
  syncedAt: string | null;
  count: number;
  hint: string | null;
}

export interface RoadmapSprint {
  sprint: number;
  effort: number;
  capacity: number;
  stories: { id: string; title: string; effort: number; color: string; status: Readiness; epic: string; outcome: string; rank: number; rice: number; health: number }[];
}

export interface Roadmap {
  sprints: RoadmapSprint[];
  outcomeSprints: Record<string, number>;
  deliverySummary: string;
}

export interface SprintPlan {
  selected: { id: string; title: string; effort: number; status: Readiness; health: number }[];
  totalEffort: number;
  capacity: number;
  overCapacity: boolean;
  warnings: string[];
  outcomesCovered: string[];
  avgHealth: number;
}

export interface Scenario {
  key: 'fix_first' | 'build_first' | 'balanced';
  label: string;
  description: string;
  stories: { id: string; title: string; effort: number; type: StoryType }[];
  totalEffort: number;
  avgHealth: number;
  avgConflict: number;
  outcomesCovered: string[];
}

export interface Fairness {
  groups: Record<string, number>;
  history: Record<string, string[]>;
  recommendation: string;
}

export interface SubStory {
  title: string;
  userStory: string;
  effortWeeks: number;
  priority: string;
  rationale: string;
}

export interface Refinement {
  shouldDecompose: boolean;
  reason: string;
  subStories: SubStory[];
  hiddenRisks: string[];
  missingElements: string[];
  refinementAdvice: string;
}

export interface ConflictOption {
  label: string;
  opsImpact: string;
  leadershipImpact: string;
  engImpact: string;
  risk: string;
}

export interface ConflictResolution {
  storyId: string;
  title: string;
  conflictIdx: number;
  coreTension: string;
  opsPosition: string;
  leadershipPosition: string;
  engPosition: string;
  optionA: ConflictOption;
  optionB: ConflictOption;
  recommendedOption: 'A' | 'B';
  recommendationReason: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api/po${path}`);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/po${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export const po = {
  backlog: () => get<Backlog>('/backlog'),
  jiraStatus: () => get<JiraPoStatus>('/jira/status'),
  jiraSync: () => post<{ synced: number; jql: string; source: string }>('/jira/sync', {}),
  jiraReset: () => post<{ source: string; count: number }>('/jira/reset', {}),
  trends: () => get<Trends>('/trends'),
  predictionAccuracy: () => get<PredictionReport>('/prediction-accuracy'),
  aiConflict: (id: string) => post<ConflictResolution>(`/stories/${id}/ai/conflict`, {}),
  aiDecompose: (id: string) => post<Refinement>(`/stories/${id}/ai/decompose`, {}),
  aiComplexity: (id: string) => post<ComplexityFinding>(`/stories/${id}/ai/complexity`, {}),
  aiResults: () =>
    get<{ conflicts: Record<string, ConflictResolution>; refinements: Record<string, Refinement>; complexity: Record<string, ComplexityFinding> }>('/ai/results'),
  copilot: (messages: { role: 'user' | 'assistant'; content: string }[]) =>
    post<{ reply: string; toolTrace: { tool: string; input: Record<string, unknown> }[] }>('/copilot', { messages }),
  roadmap: (capacity: number) => get<Roadmap>(`/roadmap?capacity=${capacity}`),
  sprint: (selectedIds: string[], capacity: number) => post<SprintPlan>('/sprint', { selectedIds, capacity }),
  scenarios: (capacity: number) => get<Scenario[]>(`/scenarios?capacity=${capacity}`),
  fairness: () => get<Fairness>('/fairness'),
  refinements: () => get<Record<string, Refinement>>('/refinements'),
  conflicts: () => get<ConflictResolution[]>('/conflicts'),
};
