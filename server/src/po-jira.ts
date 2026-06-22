// Pull a Product Owner backlog from Jira and map issues onto the backlog
// scoring model. Jira does not carry INVEST dimensions, RICE inputs, story
// type, business outcome or stakeholder votes, so those are DERIVED with
// transparent heuristics from the fields Jira does provide (description,
// acceptance criteria, priority, story points, issue links, labels). Every
// derived value is deterministic so a Product Owner can review and override.

import { adfToText, jiraConfigFromEnv, type JiraConfig } from './integrations/jira.js';
import type { RawStory, StakeholderVotes, StoryType } from './engines/backlog.js';

export interface PoJiraConfig extends JiraConfig {
  storyPointsField: string | null;
}

export function poJiraConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PoJiraConfig | null {
  const base = jiraConfigFromEnv(env);
  if (!base) return null;
  // PO sync usually wants the whole product backlog, not just the refinement
  // queue — allow a dedicated JQL, falling back to the shared one.
  return {
    ...base,
    jql: env.JIRA_PO_JQL ?? base.jql,
    storyPointsField: env.JIRA_STORYPOINTS_FIELD ?? null,
  };
}

interface RawJiraIssue {
  key: string;
  fields: {
    summary?: string;
    description?: unknown;
    issuetype?: { name?: string };
    priority?: { name?: string };
    labels?: string[];
    components?: { name?: string }[];
    issuelinks?: {
      type?: { inward?: string; outward?: string };
      inwardIssue?: { key?: string };
      outwardIssue?: { key?: string };
    }[];
    [key: string]: unknown;
  };
}

export interface MappedBacklog {
  stories: RawStory[];
  votes: Record<string, StakeholderVotes>;
}

const BLOCKED_BY = /blocked by|depends on|is caused by/i;

/** Fetch issues for the PO backlog, following pagination. */
export async function fetchPoIssues(cfg: PoJiraConfig, fetchImpl: typeof fetch = fetch): Promise<RawJiraIssue[]> {
  const auth = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString('base64');
  const fields = ['summary', 'description', 'issuetype', 'priority', 'labels', 'components', 'issuelinks'];
  if (cfg.storyPointsField) fields.push(cfg.storyPointsField);

  const issues: RawJiraIssue[] = [];
  let nextPageToken: string | undefined;
  do {
    const params = new URLSearchParams({ jql: cfg.jql, maxResults: '100', fields: fields.join(',') });
    if (nextPageToken) params.set('nextPageToken', nextPageToken);
    const res = await fetchImpl(`${cfg.baseUrl}/rest/api/3/search/jql?${params}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Jira search failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { issues?: RawJiraIssue[]; nextPageToken?: string; isLast?: boolean };
    issues.push(...(body.issues ?? []));
    nextPageToken = body.isLast ? undefined : body.nextPageToken;
  } while (nextPageToken);
  return issues;
}

// ── Heuristic field derivation ──────────────────────────────────────────────

const REGULATED_RE = /\b(fca|regulat|complian|audit|pii|gdpr|suitab|consumer duty|aml|kyc|sm&cr|smcr|cobs|sysc|sanction|financial crime)\b/i;
const COMPLY_RE = /\b(complian|regulat|fca|audit|aml|kyc|consumer duty|cobs|sysc|suitab|reporting)\b/i;
const ENHANCE_RE = /\b(improv|enhance|optimis|optimize|refine|polish|ux|usability)\b/i;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Count acceptance criteria signals in a description. */
function countAc(text: string): number {
  const thens = (text.match(/\bthen\b/gi) ?? []).length; // Gherkin scenarios
  const checks = (text.match(/^\s*[-*]\s*\[.?\]/gim) ?? []).length; // checkbox bullets
  const acLines = (text.match(/^\s*(ac\s*\d|acceptance criteria)/gim) ?? []).length;
  return Math.max(thens, checks, acLines);
}

function priorityToImpact(priority: string | null): number {
  switch ((priority ?? '').toLowerCase()) {
    case 'highest': case 'blocker': case 'critical': case 'high': return 3;
    case 'low': case 'lowest': case 'minor': case 'trivial': return 1;
    default: return 2;
  }
}

function issueTypeReach(issueType: string): number {
  const t = issueType.toLowerCase();
  if (t.includes('epic')) return 800;
  if (t.includes('story')) return 500;
  if (t.includes('bug') || t.includes('defect')) return 400;
  if (t.includes('sub')) return 100;
  return 300; // task / other
}

function defaultEffort(issueType: string): number {
  const t = issueType.toLowerCase();
  if (t.includes('epic')) return 8;
  if (t.includes('sub')) return 1;
  if (t.includes('bug') || t.includes('defect')) return 2;
  if (t.includes('story')) return 3;
  return 2;
}

function deriveStoryType(issueType: string, haystack: string): StoryType {
  const t = issueType.toLowerCase();
  if (t.includes('bug') || t.includes('defect') || t.includes('incident')) return 'FIX';
  if (COMPLY_RE.test(haystack)) return 'COMPLY';
  if (ENHANCE_RE.test(haystack) || t.includes('improvement')) return 'ENHANCE';
  return 'BUILD';
}

const OUTCOME_RULES: { id: string; re: RegExp }[] = [
  { id: 'compliance', re: /\b(complian|regulat|fca|audit|aml|kyc|consumer duty|cobs|sysc|suitab|reporting)\b/i },
  { id: 'onboarding', re: /\b(onboard|kyc|sign[- ]?up|registration|account opening|verification)\b/i },
  { id: 'retention', re: /\b(retention|nps|satisfaction|csat|churn|loyalty|experience)\b/i },
  { id: 'productivity', re: /\b(productiv|automat|efficien|admin|mobile|workflow|time[- ]?saving)\b/i },
  { id: 'conversion', re: /\b(lead|conversion|pipeline|sales|opportunit|prospect|deal)\b/i },
];

function deriveOutcome(haystack: string): string {
  for (const rule of OUTCOME_RULES) if (rule.re.test(haystack)) return rule.id;
  return 'conversion';
}

/** Stakeholder vote pattern by story type — mirrors the sample's tensions. */
function votesForType(type: StoryType): StakeholderVotes {
  switch (type) {
    case 'FIX': return { ops: 1, leadership: 3, engineering: 2 };
    case 'COMPLY': return { ops: 2, leadership: 1, engineering: 2 };
    case 'BUILD': return { ops: 3, leadership: 5, engineering: 3 };
    case 'ENHANCE': return { ops: 3, leadership: 4, engineering: 3 };
  }
}

export function mapIssueToRawStory(
  issue: RawJiraIssue,
  storyPointsField: string | null,
): { story: RawStory; votes: StakeholderVotes } {
  const f = issue.fields;
  const summary = f.summary ?? '';
  const description = adfToText(f.description).trim();
  const issueType = f.issuetype?.name ?? 'Story';
  const labels = f.labels ?? [];
  const components = (f.components ?? []).map((c) => c.name ?? '').filter(Boolean);
  const haystack = [summary, description, issueType, ...labels, ...components].join(' ').toLowerCase();

  const userStory = description || summary;
  const hasUserStory = /^as an?\b/i.test(userStory.trim());
  const hasSoThat = /\bso that\b|\bin order to\b/i.test(userStory);
  const acCount = countAc(description);
  const descLen = description.length;

  const sp = storyPointsField ? Number(f[storyPointsField]) : NaN;
  const effort = clamp(Number.isFinite(sp) && sp > 0 ? Math.round(sp) : defaultEffort(issueType), 1, 13);

  const storyType = deriveStoryType(issueType, haystack);
  const outcome = deriveOutcome(haystack);
  const regulated = REGULATED_RE.test(haystack);

  // INVEST dimensions, each 1–5, derived from available signals.
  const I = clamp(5 - dependencyCount(issue), 1, 5);
  const N = descLen > 0 ? 4 : 3;
  const V = hasSoThat ? 5 : descLen > 40 ? 4 : 3;
  const E = Number.isFinite(sp) && sp > 0 ? 5 : descLen > 80 ? 4 : descLen > 0 ? 3 : 2;
  const S = effort <= 2 ? 5 : effort <= 3 ? 4 : effort <= 5 ? 3 : effort <= 8 ? 2 : 1;
  let T = acCount >= 3 ? 5 : acCount >= 1 ? 3 : 2;
  if (/\bgiven\b/i.test(description) && /\bthen\b/i.test(description)) T = clamp(T + 1, 1, 5);

  const impact = priorityToImpact(f.priority?.name ?? null);
  const reach = issueTypeReach(issueType);
  let confidence = 70;
  if (hasUserStory && descLen > 80 && acCount >= 3) confidence = 90;
  else if (descLen < 40) confidence = 55;
  confidence = clamp(confidence, 30, 95);

  const story: RawStory = {
    id: issue.key,
    epic: components[0] ?? labels[0] ?? issueType,
    title: summary,
    userStory,
    businessValue: hasSoThat ? userStory.split(/so that|in order to/i).slice(1).join(' ').trim() : '(not stated in Jira)',
    stakeholderOutcome: '(derived from Jira — refine in the Product Owner tool)',
    invest: { I, N, V, E, S, T },
    reach,
    impact,
    confidence,
    effort,
    regulated,
    acCount,
    dependencies: dependencyKeys(issue),
    storyType,
    outcome,
  };
  return { story, votes: votesForType(storyType) };
}

function dependencyKeys(issue: RawJiraIssue): string[] {
  const keys: string[] = [];
  for (const link of issue.fields.issuelinks ?? []) {
    // "inward" relative to this issue: e.g. this issue "is blocked by" inwardIssue.
    if (link.inwardIssue?.key && BLOCKED_BY.test(link.type?.inward ?? '')) keys.push(link.inwardIssue.key);
  }
  return [...new Set(keys)];
}

function dependencyCount(issue: RawJiraIssue): number {
  return dependencyKeys(issue).length;
}

/** Fetch + map a full PO backlog from Jira. Keeps only in-set dependencies. */
export async function syncPoBacklogFromJira(cfg: PoJiraConfig, fetchImpl: typeof fetch = fetch): Promise<MappedBacklog> {
  const issues = await fetchPoIssues(cfg, fetchImpl);
  const mapped = issues.map((i) => mapIssueToRawStory(i, cfg.storyPointsField));
  const ids = new Set(mapped.map((m) => m.story.id));
  const stories = mapped.map((m) => ({ ...m.story, dependencies: m.story.dependencies.filter((d) => ids.has(d)) }));
  const votes: Record<string, StakeholderVotes> = {};
  for (const m of mapped) votes[m.story.id] = m.votes;
  return { stories, votes };
}
