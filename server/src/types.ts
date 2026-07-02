// Shared domain types for the QE Framework portal.

export type StoryType = 'feature' | 'bug' | 'tech_debt';

export type Role = 'BA' | 'PO' | 'Dev' | 'QA' | 'QE Lead' | 'Release Manager';

/** Story status lifecycle — QE Framework §3.3 */
export type StoryStatus =
  | 'backlog'
  | 'in_readiness_review'
  | 'actions_pending'
  | 'ready_for_3_amigos'
  | 'three_amigos_complete'
  | 'ac_draft_in_review'
  | 'ready_for_dev'
  | 'in_development'
  | 'dev_self_certification'
  | 'qe_verification'
  | 'ready_for_release'
  | 'released';

/** Sensitive areas that trigger auto security/accessibility AC — §5.1, §10 */
export type SensitiveArea = 'auth' | 'payments' | 'personal_data' | 'ui';

export interface Story {
  id: string;
  title: string;
  description: string;
  type: StoryType;
  status: StoryStatus;
  module: string;
  priority: 'P1' | 'P2' | 'P3' | null;
  touches: SensitiveArea[];
  edgeCases: string[];
  dorChecks: Record<string, boolean>;
  dodChecks: Record<string, boolean>;
  dodVerified: Record<string, boolean>;
  /** Jira issue key when the story was synced from Jira (e.g. "QE-123") */
  jiraKey?: string | null;
  /** Open/closed action items from the 3 Amigos evaluator */
  actions?: ActionItem[];
  createdAt: string;
  updatedAt: string;
}

/** An owned action item raised by the 3 Amigos evaluator (§3) */
export interface ActionItem {
  id: string; // stable per source, e.g. "invest-V" — survives re-evaluation
  owner: 'BA' | 'Dev' | 'PO' | 'QA';
  description: string;
  severity: 'blocker' | 'attention'; // from INVEST fail / warn
  source: string; // e.g. "INVEST V — Valuable"
  done: boolean;
  /** Jira sub-task key once pushed to Jira (prevents duplicate creation) */
  jiraKey?: string | null;
}

export type TestType =
  | 'unit'
  | 'functional'
  | 'e2e'
  | 'regression'
  | 'api_automation'
  | 'ui_automation';

export type ScenarioKind = 'happy' | 'negative' | 'edge' | 'security' | 'accessibility';

export interface Gherkin {
  given: string;
  when: string;
  then: string;
}

export interface AcScenario {
  id: string;
  storyId: string;
  title: string;
  kind: ScenarioKind;
  gherkin: Gherkin;
  testTypes: TestType[];
  automationCandidate: boolean;
  automationLayer: 'api' | 'ui' | 'manual';
  automationReasons: string[];
  approved: boolean;
  source: 'ai' | 'template';
}

/** Risk types — §6.2 */
export type RiskType =
  | 'coverage_gap'
  | 'dependency'
  | 'regression'
  | 'complexity'
  | 'technical_debt'
  | 'data'
  | 'performance'
  | 'security';

export type RiskBand = 'low' | 'medium' | 'high';

export interface Risk {
  id: string;
  type: RiskType;
  module: string;
  description: string;
  severity: number; // 1 (low) .. 4 (critical)
  likelihood: number; // 1 (low) .. 4 (critical)
  score: number;
  band: RiskBand;
  action: string;
  mitigation: string | null;
  source: 'ai' | 'qe_manual';
  status: 'open' | 'mitigated' | 'accepted' | 'closed';
  createdAt: string;
}

export type DefectSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Defect {
  id: string;
  module: string;
  severity: DefectSeverity;
  title: string;
  foundIn: 'requirements' | 'design' | 'development' | 'testing' | 'production';
  status: 'open' | 'fixed' | 'closed';
  createdAt: string;
}

/** A regression test case with execution history — §7 */
export interface TestCase {
  id: string;
  name: string;
  module: string;
  smoke: boolean; // P1 core journey
  tags: string[]; // e.g. ['regression']
  automated: boolean;
  history: {
    failedInLastRelease: boolean;
    lastFailedReleasesAgo: number | null; // null = never failed
    flaky: boolean;
    fixedButHighRiskArea: boolean;
    sprintsSinceLastFailure: number | null;
  };
}
