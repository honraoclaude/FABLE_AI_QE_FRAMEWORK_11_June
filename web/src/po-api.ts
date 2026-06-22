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
  roadmap: (capacity: number) => get<Roadmap>(`/roadmap?capacity=${capacity}`),
  sprint: (selectedIds: string[], capacity: number) => post<SprintPlan>('/sprint', { selectedIds, capacity }),
  scenarios: (capacity: number) => get<Scenario[]>(`/scenarios?capacity=${capacity}`),
  fairness: () => get<Fairness>('/fairness'),
  refinements: () => get<Record<string, Refinement>>('/refinements'),
  conflicts: () => get<ConflictResolution[]>('/conflicts'),
};
