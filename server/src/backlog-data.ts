// Sample backlog + strategic metadata — Financial Sales Cloud in an
// FCA-regulated environment (wealth/advice sales platform). Themes: Consumer
// Duty, COBS suitability, SM&CR accountability, KYC/AML onboarding, FCA audit
// trail and regulatory reporting (RegData).

import type { Outcome, RawStory, StakeholderVotes, StoryType } from './engines/backlog.js';

export const OUTCOMES: Outcome[] = [
  { id: 'conversion', label: 'Improve Lead Conversion', color: '#1F3864', target: '>35%', current: '18%', unit: 'lead-to-client conversion' },
  { id: 'productivity', label: 'Boost Adviser Productivity', color: '#00709B', target: '−60% admin', current: 'baseline', unit: 'adviser admin time' },
  { id: 'compliance', label: 'Ensure FCA Compliance', color: '#B5520F', target: '100% audit', current: '74% audit', unit: 'regulatory audit coverage' },
  { id: 'onboarding', label: 'Accelerate Client Onboarding', color: '#1E6B4A', target: '<2 days', current: '9 days', unit: 'KYC/AML onboarding time' },
  { id: 'retention', label: 'Drive Client Retention', color: '#5C277F', target: '>90 NPS', current: '78 NPS', unit: 'client NPS' },
];

export const STAKEHOLDER_VOTES: Record<string, StakeholderVotes> = {
  'FSC-001': { ops: 1, leadership: 2, engineering: 2 },
  'FSC-002': { ops: 1, leadership: 2, engineering: 1 },
  'FSC-003': { ops: 3, leadership: 5, engineering: 3 },
  'FSC-004': { ops: 3, leadership: 5, engineering: 4 },
  'FSC-005': { ops: 2, leadership: 4, engineering: 3 },
  'FSC-006': { ops: 1, leadership: 3, engineering: 2 },
  'FSC-007': { ops: 2, leadership: 3, engineering: 1 },
  'FSC-008': { ops: 2, leadership: 1, engineering: 2 },
  'FSC-009': { ops: 1, leadership: 2, engineering: 1 },
  'FSC-010': { ops: 3, leadership: 4, engineering: 3 },
  'FSC-011': { ops: 2, leadership: 2, engineering: 3 },
  'FSC-012': { ops: 4, leadership: 5, engineering: 3 },
};

export const SPRINT_HISTORY: Record<number, string[]> = {
  1: ['ops', 'compliance'],
  2: ['leadership', 'engineering'],
  3: ['ops', 'engineering'],
  4: ['leadership', 'compliance'],
  5: ['ops', 'leadership'],
};

const I = (a: number, n: number, v: number, e: number, s: number, t: number) => ({ I: a, N: n, V: v, E: e, S: s, T: t });

export const SAMPLE_BACKLOG: RawStory[] = [
  {
    id: 'FSC-001', epic: 'Lead Management', title: 'Lead Scoring & Routing Engine',
    userStory: 'As a sales manager I want inbound leads automatically scored and routed to the best-fit adviser so that high-intent prospects are contacted within minutes',
    businessValue: 'Lift lead-to-client conversion from 18% to 35%', stakeholderOutcome: 'High-intent leads reach the right adviser within minutes — conversion up an estimated 40%',
    invest: I(4, 4, 5, 4, 4, 5), reach: 800, impact: 3, confidence: 90, effort: 2, regulated: true, acCount: 6, dependencies: [], storyType: 'FIX', outcome: 'conversion',
  },
  {
    id: 'FSC-002', epic: 'Sales Operations', title: 'Adviser Pipeline Dashboard',
    userStory: 'As a sales manager I want a real-time dashboard showing each adviser’s pipeline and conversion rate so I can see where deals are stalling',
    businessValue: 'Improve pipeline visibility and forecast accuracy', stakeholderOutcome: 'Managers see live pipeline health by adviser — enabling data-driven coaching decisions',
    invest: I(4, 5, 5, 4, 4, 5), reach: 600, impact: 3, confidence: 85, effort: 2, regulated: false, acCount: 5, dependencies: ['FSC-001'], storyType: 'FIX', outcome: 'conversion',
  },
  {
    id: 'FSC-003', epic: 'Suitability & Advice', title: 'Suitability Assessment Workflow (COBS)',
    userStory: 'As an adviser I want a guided suitability assessment built into the sales flow so that every recommendation is COBS-compliant and evidenced',
    businessValue: 'Reduce suitability breaches and remediation cost', stakeholderOutcome: 'Every advised sale carries a complete, auditable suitability record — COBS 9 compliance by design',
    invest: I(3, 3, 5, 2, 2, 3), reach: 1200, impact: 3, confidence: 60, effort: 8, regulated: true, acCount: 4, dependencies: ['FSC-001', 'FSC-009'], storyType: 'BUILD', outcome: 'compliance',
  },
  {
    id: 'FSC-004', epic: 'Consumer Duty', title: 'Consumer Duty Outcome Monitoring',
    userStory: 'As a compliance lead I want automated monitoring of the four Consumer Duty outcomes across the client book so that poor outcomes are surfaced before they become harm',
    businessValue: 'Evidence good outcomes and avoid FCA intervention', stakeholderOutcome: 'Foreseeable harm flagged proactively across the client book — Consumer Duty evidenced continuously',
    invest: I(3, 3, 5, 2, 3, 3), reach: 400, impact: 3, confidence: 55, effort: 6, regulated: true, acCount: 3, dependencies: ['FSC-001', 'FSC-009'], storyType: 'BUILD', outcome: 'compliance',
  },
  {
    id: 'FSC-005', epic: 'Adviser Experience', title: 'Adviser Mobile App',
    userStory: 'As an adviser I want a mobile app showing my pipeline, tasks, and client meetings so I can manage my day between client visits without a laptop',
    businessValue: 'Increase adviser face-time and productivity', stakeholderOutcome: 'Advisers manage their full day from their phone — 30% faster follow-up after client meetings',
    invest: I(4, 4, 4, 4, 4, 4), reach: 500, impact: 2, confidence: 80, effort: 3, regulated: false, acCount: 5, dependencies: ['FSC-001', 'FSC-002'], storyType: 'ENHANCE', outcome: 'productivity',
  },
  {
    id: 'FSC-006', epic: 'Sales Productivity', title: 'Automated Meeting Notes to CRM',
    userStory: 'As an adviser I want client meeting notes captured and written back to the CRM automatically so that no follow-up action or compliance note is lost',
    businessValue: 'Eliminate manual note entry and reduce admin', stakeholderOutcome: 'Every client meeting auto-logged with actions and compliance notes — zero manual CRM entry',
    invest: I(5, 5, 4, 5, 5, 5), reach: 700, impact: 2, confidence: 95, effort: 1, regulated: false, acCount: 6, dependencies: ['FSC-001'], storyType: 'FIX', outcome: 'productivity',
  },
  {
    id: 'FSC-007', epic: 'Client Onboarding', title: 'KYC/AML Onboarding Automation',
    userStory: 'As an onboarding officer I want client identity, KYC and AML checks automated and orchestrated so that new clients are onboarded in under two days',
    businessValue: 'Cut onboarding time from 9 days to under 2 and reduce AML risk', stakeholderOutcome: 'New clients onboarded in under 2 days with automated KYC/AML — fewer drop-offs, lower financial-crime risk',
    invest: I(2, 3, 5, 2, 2, 3), reach: 400, impact: 3, confidence: 60, effort: 8, regulated: true, acCount: 3, dependencies: ['FSC-009'], storyType: 'FIX', outcome: 'onboarding',
  },
  {
    id: 'FSC-008', epic: 'Compliance', title: 'FCA Audit Trail & Record Keeping (SYSC)',
    userStory: 'As a compliance officer I want every advice interaction, communication and decision logged with user, client and timestamp so we can produce regulatory evidence on demand',
    businessValue: 'Meet SYSC record-keeping obligations — mandatory', stakeholderOutcome: 'Complete, tamper-evident audit trail of all advice activity available on demand — SYSC compliance maintained',
    invest: I(5, 4, 5, 5, 4, 5), reach: 300, impact: 3, confidence: 95, effort: 2, regulated: true, acCount: 7, dependencies: [], storyType: 'COMPLY', outcome: 'compliance',
  },
  {
    id: 'FSC-009', epic: 'Data Platform', title: 'Single Client View Platform',
    userStory: 'As a data lead I want a unified single client view consolidating holdings, interactions and suitability across all systems so that advisers and compliance work from one source of truth',
    businessValue: 'Enable every sales, advice and compliance capability', stakeholderOutcome: 'One trusted client record across the firm — the foundation for advice, sales analytics and regulatory reporting',
    invest: I(3, 3, 5, 3, 2, 4), reach: 5000, impact: 3, confidence: 75, effort: 5, regulated: true, acCount: 4, dependencies: [], storyType: 'FIX', outcome: 'conversion',
  },
  {
    id: 'FSC-010', epic: 'Client Experience', title: 'Client NPS & Satisfaction Tracker',
    userStory: 'As a client experience manager I want post-interaction NPS surveys sent automatically so I can track client satisfaction and spot vulnerable-customer signals',
    businessValue: 'Improve retention and evidence good client outcomes', stakeholderOutcome: 'Client satisfaction tracked automatically after every interaction — early signal of dissatisfaction or vulnerability',
    invest: I(4, 5, 4, 5, 5, 5), reach: 800, impact: 2, confidence: 90, effort: 1, regulated: false, acCount: 5, dependencies: ['FSC-006'], storyType: 'ENHANCE', outcome: 'retention',
  },
  {
    id: 'FSC-011', epic: 'Compliance', title: 'Regulatory Reporting Dashboard (RegData)',
    userStory: 'As a compliance officer I want regulatory returns auto-compiled and validated for RegData submission so that I can demonstrate adherence without manual collation',
    businessValue: 'Reduce regulatory reporting effort from 3 days to 30 mins', stakeholderOutcome: 'RegData returns compiled and validated automatically — compliance team saves 3 days per reporting cycle',
    invest: I(3, 4, 4, 3, 3, 4), reach: 200, impact: 2, confidence: 70, effort: 3, regulated: true, acCount: 4, dependencies: ['FSC-008'], storyType: 'COMPLY', outcome: 'compliance',
  },
  {
    id: 'FSC-012', epic: 'AI & Analytics', title: 'AI Backlog Refinement Agent',
    userStory: 'As a product owner I want an AI agent to review incoming requirements and surface ambiguities and missing acceptance criteria so that stories are sprint-ready faster',
    businessValue: 'Reduce refinement session time by 50%', stakeholderOutcome: 'Stories arrive at sprint planning 60% more complete — refinement sessions cut from 90min to 45min',
    invest: I(4, 4, 4, 3, 4, 4), reach: 50, impact: 3, confidence: 70, effort: 4, regulated: false, acCount: 5, dependencies: [], storyType: 'BUILD', outcome: 'productivity',
  },
];

// ── Story refinement analysis (decomposition) ──────────────────────────────

export interface SubStory {
  title: string;
  userStory: string;
  effortWeeks: number;
  priority: 'High' | 'Medium' | 'Low';
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

export const STORY_REFINEMENTS: Record<string, Refinement> = {
  'FSC-001': { shouldDecompose: false, reason: 'Two-week story with clear scope and testable routing rules.', subStories: [], hiddenRisks: ['Lead scoring model not defined — risk of mis-routing high-value prospects'], missingElements: ['Minimum lead score threshold for adviser routing', 'Fair-allocation rule to avoid adviser cherry-picking'], refinementAdvice: 'Sprint-ready. Agree the lead scoring model and fair-allocation rule with sales ops before sprint entry.' },
  'FSC-002': { shouldDecompose: false, reason: 'Two-week dashboard with a clear pipeline-visibility outcome.', subStories: [], hiddenRisks: ['Conversion-rate definition not yet agreed — risk of metric disagreement post-delivery'], missingElements: ['Conversion-rate formula definition', 'Minimum pipeline history before metrics are reliable'], refinementAdvice: 'Add an explicit conversion-rate definition to the acceptance criteria. Otherwise sprint-ready.' },
  'FSC-003': { shouldDecompose: true, reason: 'Eight-week story spanning four distinct deliverables that each require compliance sign-off before the next proceeds.', subStories: [
    { title: 'Risk Profiling & Capacity-for-Loss Capture', userStory: 'As an adviser I want a structured risk-profiling and capacity-for-loss questionnaire so that suitability is grounded in evidenced client data', effortWeeks: 2, priority: 'High', rationale: 'Foundation — suitability cannot be assessed without an evidenced client risk profile' },
    { title: 'Suitability Rules Engine & Recommendation Check', userStory: 'As an adviser I want the recommended product checked against the client’s risk profile and objectives so that unsuitable recommendations are blocked', effortWeeks: 3, priority: 'High', rationale: 'Core COBS 9 control — the heart of the suitability obligation' },
    { title: 'Suitability Report Generation', userStory: 'As an adviser I want a compliant suitability report generated automatically so that the client receives clear evidenced reasons for the recommendation', effortWeeks: 1, priority: 'High', rationale: 'Mandatory client-facing deliverable under COBS 9.4' },
    { title: 'Compliance Review & Sampling Workflow', userStory: 'As a compliance officer I want a sampling and review workflow over completed suitability assessments so that file-checking is systematic and evidenced', effortWeeks: 2, priority: 'Medium', rationale: 'Required for the firm’s ongoing suitability monitoring obligation' },
  ], hiddenRisks: ['Suitability rules differ by product wrapper (ISA, pension, GIA) — scope may expand', 'Compliance sign-off on the rules engine may take 2–3 weeks', 'Existing legacy advice records may not map cleanly to the new model'], missingElements: ['Product-wrapper scope confirmed for v1', 'Compliance-approved suitability rule set', 'Legacy record migration approach'], refinementAdvice: 'Split into 4 sub-stories. Run a one-week spike on the suitability rules engine with Compliance in the room before committing to the full build.' },
  'FSC-004': { shouldDecompose: true, reason: 'Six-week analytics story with three sequential phases each requiring validation before the next begins.', subStories: [
    { title: 'Consumer Duty Outcome Data Model & Feeds', userStory: 'As a data engineer I want the four Consumer Duty outcomes mapped to measurable signals across the client book so that monitoring has reliable inputs', effortWeeks: 2, priority: 'High', rationale: 'Monitoring quality depends entirely on the outcome data model — must come first' },
    { title: 'Foreseeable-Harm Detection Rules', userStory: 'As a compliance lead I want rules that flag foreseeable harm (e.g. clients in unsuitable products, high fees vs benefit) so that poor outcomes surface early', effortWeeks: 2, priority: 'High', rationale: 'Core monitoring logic — validated against known historical cases' },
    { title: 'Consumer Duty Board MI Dashboard', userStory: 'As a Consumer Duty champion I want board-level MI on the four outcomes so that the firm can evidence good outcomes to the FCA', effortWeeks: 2, priority: 'High', rationale: 'Board accountability deliverable under SM&CR for the Consumer Duty' },
  ], hiddenRisks: ['Outcome signals may be subjective — risk of disputes over what counts as “harm”', 'Detection accuracy may produce high false-positive volume on first attempt', 'MI definitions must satisfy the Consumer Duty board champion'], missingElements: ['Agreed definition of foreseeable harm per outcome', 'False-positive tolerance agreed with Compliance', 'Board MI format approved by the Duty champion'], refinementAdvice: 'Build the outcome data model first — weak signals guarantee weak monitoring. Validate detection rules against historical remediation cases before going live.' },
  'FSC-005': { shouldDecompose: false, reason: 'Three-week mobile app story achievable in a single sprint.', subStories: [], hiddenRisks: ['Offline access to client data raises data-protection questions — must be assessed first', 'Push notification reliability varies by device OS and network'], missingElements: ['Offline client-data handling assessed by Compliance/DPO', 'Push notification failure handling'], refinementAdvice: 'Resolve the offline client-data handling question with the DPO first — it is the highest-risk element. If timeline is tight, ship online-only in v1.' },
  'FSC-006': { shouldDecompose: false, reason: 'One-week story — the smallest sprint-ready item in the backlog.', subStories: [], hiddenRisks: ['Auto-captured notes may contain client PII that must be handled under retention policy'], missingElements: ['PII handling and retention rule for captured notes defined', 'Adviser correction/override workflow for inaccurate notes'], refinementAdvice: 'Sprint-ready. Ship next sprint as a quick win — but confirm the PII retention rule for captured notes first.' },
  'FSC-007': { shouldDecompose: true, reason: 'Eight-week story combining identity verification, AML screening and case orchestration — each independently complex and regulated.', subStories: [
    { title: 'Digital Identity Verification (eIDV)', userStory: 'As an onboarding officer I want client identity verified digitally against trusted data sources so that KYC is completed without manual document chasing', effortWeeks: 3, priority: 'High', rationale: 'Foundation — validates the identity-verification provider and data quality before adding screening' },
    { title: 'AML / Sanctions / PEP Screening', userStory: 'As an onboarding officer I want automated AML, sanctions and PEP screening with risk scoring so that financial-crime risk is assessed consistently', effortWeeks: 2, priority: 'High', rationale: 'Core financial-crime control — must never be bypassed' },
    { title: 'Onboarding Case Orchestration & Audit', userStory: 'As an onboarding officer I want a case workflow that records every check, decision and approver so that onboarding is fully auditable end to end', effortWeeks: 2, priority: 'High', rationale: 'Mandatory audit trail for AML decisioning under the firm’s obligations' },
  ], hiddenRisks: ['eIDV match rates vary by client segment — manual fallback path required', 'Enhanced due diligence (EDD) for high-risk clients adds a manual review step', 'Screening provider false-positive rate not yet confirmed'], missingElements: ['Manual fallback path for failed eIDV', 'EDD trigger thresholds agreed with MLRO', 'Screening provider SLA and false-positive handling'], refinementAdvice: 'Split into 3 stories. Ship eIDV first to validate match rates, then add screening and case orchestration. Involve the MLRO in the EDD threshold decision.' },
  'FSC-008': { shouldDecompose: false, reason: 'Well-scoped compliance story with clear SYSC record-keeping requirements and a known implementation pattern.', subStories: [], hiddenRisks: ['Audit log schema must be finalised before other regulated features go to production'], missingElements: ['Log schema reviewed by Compliance', 'Retention period confirmed per SYSC/record-keeping policy'], refinementAdvice: 'Sprint-ready. This must be a release gate for all other regulated stories — ship before FSC-003, FSC-004, FSC-007, FSC-009.' },
  'FSC-009': { shouldDecompose: true, reason: 'Five-week foundational story spanning two distinct data challenges with different risk profiles.', subStories: [
    { title: 'Single Client View — Core Consolidation (pilot book)', userStory: 'As a data engineer I want holdings, interactions and suitability consolidated for a pilot client book so that I can validate the data model before full scale', effortWeeks: 3, priority: 'High', rationale: 'Validates entity-resolution and data-quality assumptions before firm-wide investment' },
    { title: 'Firm-Wide Scale-Up & Data Quality Monitoring', userStory: 'As a data engineer I want the single client view scaled to the full book with automated data-quality monitoring so that advice and reporting run on trusted data', effortWeeks: 2, priority: 'High', rationale: 'Production hardening after the data model is validated on the pilot' },
  ], hiddenRisks: ['Entity resolution across legacy systems may be lower quality than expected', 'Source systems may disagree on the “golden” client record — governance needed', 'PII consolidation increases data-protection surface area'], missingElements: ['Golden-source governance decision per data domain', 'Data-protection impact assessment (DPIA) for consolidation'], refinementAdvice: 'Make the golden-source governance decision in Sprint 1 before building. Use the pilot book to validate entity-resolution quality, and complete the DPIA early.' },
  'FSC-010': { shouldDecompose: false, reason: 'One-week story with clear scope, fully dependent on FSC-006.', subStories: [], hiddenRisks: ['Survey timing affects response rate and may miss vulnerable-customer signals if sent too late'], missingElements: ['Optimal survey timing agreed with client experience team', 'Vulnerable-customer signal handling defined for low scores'], refinementAdvice: 'Sprint-ready. Ship alongside FSC-006 for an immediate NPS baseline — and route low scores into the vulnerable-customer process.' },
  'FSC-011': { shouldDecompose: false, reason: 'Three-week compliance story with clear scope once the FSC-008 audit log is complete.', subStories: [], hiddenRisks: ['RegData return definitions are detailed and change with FCA policy — risk of validation failures'], missingElements: ['Mapping of internal data to each RegData field', 'Validation rules approved by Compliance'], refinementAdvice: 'Blocked by FSC-008. Confirm the RegData field mapping with Compliance before sprint entry, as the returns are unforgiving on format.' },
  'FSC-012': { shouldDecompose: false, reason: 'Four-week AI pilot story with appropriate scope for a first iteration.', subStories: [], hiddenRisks: ['LLM output quality may vary — mandatory human review gate required before any backlog updates', 'Integration point (Jira plugin vs standalone API) not yet decided'], missingElements: ['Integration point decision made', 'Human-in-the-loop approval workflow defined', 'Accuracy validation set of 20+ test stories prepared'], refinementAdvice: 'Keep pilot scope to INVEST scoring only. Expand to AC generation in Sprint 2 based on pilot accuracy results.' },
};

// ── Stakeholder conflict resolutions ───────────────────────────────────────

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

export const CONFLICT_RESOLUTIONS: ConflictResolution[] = [
  { storyId: 'FSC-003', title: 'Suitability Assessment Workflow (COBS)', conflictIdx: 50, coreTension: 'Leadership wants to ship sales-flow features that drive conversion; Compliance insists the suitability control is built first; Engineering flags the rules engine as technically uncertain.', opsPosition: 'Suitability breaches are a remediation and Section 166 risk. The control must be built into the sales flow before we accelerate volume — not bolted on later.', leadershipPosition: 'We are losing advisers to competitors with slicker journeys. Conversion features win business now; suitability tooling can follow once revenue is up.', engPosition: 'The suitability rules engine differs per product wrapper and has no spike. Committing 8 weeks without a validated rule set risks mid-sprint rework.', optionA: { label: 'Control First — Suitability built before volume features', opsImpact: 'Suitability evidenced by design before sales volume increases. Remediation risk contained.', leadershipImpact: 'Conversion features delayed 6–8 weeks. Some adviser frustration in the short term.', engImpact: 'Time to spike the rules engine and de-risk the build before full commitment.', risk: 'Leadership dissatisfied; perceived slowdown on the growth roadmap for one quarter.' }, optionB: { label: 'Parallel Track — Dedicated suitability sub-team', opsImpact: 'Conversion work continues at pace; suitability control lands at the same time.', leadershipImpact: 'Growth features start immediately; suitability does not block the roadmap.', engImpact: 'Requires a dedicated pair on the rules engine. Higher coordination overhead.', risk: 'Resource split reduces velocity on both tracks; higher coordination cost.' }, recommendedOption: 'A', recommendationReason: 'Increasing sales volume before the suitability control is in place multiplies regulatory exposure. Present leadership a phased plan: suitability control in Sprints 1–2, conversion features from Sprint 3. Frame it as protecting the growth — a Section 166 or remediation programme would halt the roadmap entirely.' },
  { storyId: 'FSC-004', title: 'Consumer Duty Outcome Monitoring', conflictIdx: 75, coreTension: 'Sales ops are sceptical of automated outcome monitoring flagging their advisers; Leadership wants it as a board/FCA story; Engineering disagrees on the validation approach.', opsPosition: 'Automated “harm” flags on advisers must be rigorously validated. A wrong flag damages adviser trust and triggers needless file reviews. We need proof before it goes live.', leadershipPosition: 'Consumer Duty is the FCA’s priority and a board accountability under SM&CR. We need monitoring we can show the regulator — not another six months of analysis.', engPosition: 'We can build it, but 55% confidence means the detection approach is unproven. A spike against historical remediation cases is non-negotiable to avoid rework.', optionA: { label: 'Validate First — 2-week spike against historical cases', opsImpact: 'Reassured by a structured validation approach before any adviser is flagged.', leadershipImpact: 'Two-week delay to start, then full commitment at materially lower risk.', engImpact: 'Clear detection-rule design before building; eliminates mid-sprint replanning.', risk: 'Slight delay to the board MI; leadership may feel slowed.' }, optionB: { label: 'Ship Fast — Pilot with mandatory compliance review of every flag', opsImpact: 'Human review of every flag limits the impact of false positives during the pilot.', leadershipImpact: 'Monitoring in production quickly; can be shown to the board as a managed pilot.', engImpact: 'Risk of reworking the detection model mid-pilot if false-positive volume is high.', risk: 'Higher mid-pilot risk; may need full replanning if accuracy is poor.' }, recommendedOption: 'A', recommendationReason: 'Option A resolves all three concerns: the spike de-risks engineering, validation against real remediation cases reassures sales ops, and leadership still gets board MI within three sprints with credible accuracy. Position it as: "We will evidence Consumer Duty outcomes accurately, not just quickly."' },
  { storyId: 'FSC-005', title: 'Adviser Mobile App', conflictIdx: 50, coreTension: 'Sales ops want a reliable field tool; Leadership wants a polished demo for adviser recruitment; Engineering wants an API-first architecture — and the DPO has questions about offline client data.', opsPosition: 'Advisers work on the move and in client homes with poor signal. Offline access is essential — a beautiful app that fails between meetings will not be adopted.', leadershipPosition: 'This app is part of our adviser value proposition and will be demoed in recruitment. It needs to look polished now; offline can be a v2 feature.', engPosition: 'Build the API layer first — it supports both online and offline naturally and keeps client data handling centralised for the DPO.', optionA: { label: 'API-First & Offline-Capable — reliability as the core principle', opsImpact: 'Works in the field from day one; immediate adviser adoption.', leadershipImpact: 'Demo may look simpler initially; UI polish lands in Sprint 2.', engImpact: 'API-first centralises client-data handling — cleaner for the DPO assessment.', risk: 'More engineering effort upfront; UI polish deferred one sprint.' }, optionB: { label: 'Online-First MVP — offline and data review retrofitted in v2', opsImpact: 'App unusable in low-signal client visits until v2; high risk of low adoption.', leadershipImpact: 'Polished demo-ready app in Sprint 1; immediate recruitment impact.', engImpact: 'Faster initial delivery, but offline and centralised data handling become costly retrofits.', risk: 'Offline retrofit and late DPO review accumulate technical and compliance debt.' }, recommendedOption: 'A', recommendationReason: 'API-first with offline capability is the correct architecture for a field advice tool handling client data, and it gives the DPO a single controlled data path. Address the recruitment-demo concern separately with a high-fidelity prototype while the production build is done correctly.' },
  { storyId: 'FSC-012', title: 'AI Backlog Refinement Agent', conflictIdx: 50, coreTension: 'Sales ops and engineering are cautious about AI influencing product decisions in a regulated firm; Leadership wants the AI agent as a differentiator.', opsPosition: 'AI must not make product decisions unchecked. If it generates wrong acceptance criteria for a regulated feature and we miss it in review, we ship a compliance gap. Guardrails are essential.', leadershipPosition: 'An AI-assisted product capability is a strong internal and external story — it positions us as a modern, efficient regulated firm.', engPosition: 'Technically manageable with a mandatory human-in-the-loop gate, but we need a validation set before claiming any accuracy figure.', optionA: { label: 'Controlled Pilot — INVEST scoring only, mandatory human approval', opsImpact: 'Reassured by a mandatory human review gate. The AI assists the product owner — it does not decide.', leadershipImpact: 'Still marketable as AI-assisted product management; pilot data builds the story.', engImpact: 'Focused scope; INVEST-scoring accuracy is measurable and improvable.', risk: 'Perceived as less ambitious by leadership in the short term.' }, optionB: { label: 'Full Agent — INVEST plus AC generation plus classification', opsImpact: 'Materially higher risk of AI errors reaching regulated sprint planning.', leadershipImpact: 'Maximum impact; a full demonstration of AI-assisted product management.', engImpact: 'Complex to validate; multiple accuracy metrics across task types required.', risk: 'Higher risk of quality issues; much harder to measure, improve, or explain to Compliance.' }, recommendedOption: 'A', recommendationReason: 'Start with INVEST scoring — the most measurable, lowest-risk AI task — with a hard human-approval gate. Collect a sprint of accuracy data, then expand to AC generation. This gives leadership a credible AI journey narrative that Compliance can sign off, rather than a single high-risk release.' },
];
