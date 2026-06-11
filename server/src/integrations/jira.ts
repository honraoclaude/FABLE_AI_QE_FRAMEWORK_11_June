// Jira Cloud REST integration — QE Framework §16 (issue tracking) / §18 Phase 1.
// Pulls stories matching a configurable JQL (default: refinement status) into
// the portal pipeline. Plain server-to-server REST — no AI in the loop.

import { randomUUID } from 'node:crypto';
import type { SensitiveArea, Story, StoryType } from '../types.js';

export interface JiraConfig {
  baseUrl: string; // e.g. https://yourteam.atlassian.net
  email: string;
  apiToken: string;
  jql: string;
}

export function jiraConfigFromEnv(env: NodeJS.ProcessEnv = process.env): JiraConfig | null {
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = env;
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) return null;
  return {
    baseUrl: JIRA_BASE_URL.replace(/\/+$/, ''),
    email: JIRA_EMAIL,
    apiToken: JIRA_API_TOKEN,
    jql: env.JIRA_JQL ?? 'status = "Refinement" ORDER BY updated DESC',
  };
}

export interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  issueType: string;
  priority: string | null;
  labels: string[];
  components: string[];
}

/** Minimal Atlassian Document Format → plain text extraction. */
export function adfToText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToText).join('');
  if (typeof node === 'object') {
    const n = node as { type?: string; text?: string; content?: unknown };
    if (typeof n.text === 'string') return n.text;
    const inner = adfToText(n.content);
    return n.type === 'paragraph' || n.type === 'heading' ? `${inner}\n` : inner;
  }
  return '';
}

const REQUESTED_FIELDS = 'summary,description,issuetype,priority,labels,components';

/**
 * Fetch all issues matching the configured JQL via /rest/api/3/search/jql,
 * following nextPageToken pagination. `fetchImpl` is injectable for tests.
 */
export async function fetchJiraIssues(
  cfg: JiraConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<JiraIssue[]> {
  const auth = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString('base64');
  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  do {
    const params = new URLSearchParams({ jql: cfg.jql, maxResults: '100', fields: REQUESTED_FIELDS });
    if (nextPageToken) params.set('nextPageToken', nextPageToken);
    const res = await fetchImpl(`${cfg.baseUrl}/rest/api/3/search/jql?${params}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Jira search failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as {
      issues?: {
        key: string;
        fields: {
          summary?: string;
          description?: unknown;
          issuetype?: { name?: string };
          priority?: { name?: string };
          labels?: string[];
          components?: { name?: string }[];
        };
      }[];
      nextPageToken?: string;
      isLast?: boolean;
    };

    for (const issue of body.issues ?? []) {
      issues.push({
        key: issue.key,
        summary: issue.fields.summary ?? '',
        description: adfToText(issue.fields.description).trim(),
        issueType: issue.fields.issuetype?.name ?? 'Story',
        priority: issue.fields.priority?.name ?? null,
        labels: issue.fields.labels ?? [],
        components: (issue.fields.components ?? []).map((c) => c.name ?? '').filter(Boolean),
      });
    }
    nextPageToken = body.isLast ? undefined : body.nextPageToken;
  } while (nextPageToken);

  return issues;
}

const PRIORITY_MAP: Record<string, Story['priority']> = {
  highest: 'P1', critical: 'P1', blocker: 'P1', high: 'P1',
  medium: 'P2',
  low: 'P3', lowest: 'P3', minor: 'P3', trivial: 'P3',
};

function storyType(issue: JiraIssue): StoryType {
  const t = issue.issueType.toLowerCase();
  const labels = issue.labels.map((l) => l.toLowerCase());
  if (t.includes('bug') || t.includes('defect')) return 'bug';
  if (t.includes('debt') || labels.includes('tech-debt') || labels.includes('tech_debt')) return 'tech_debt';
  return 'feature';
}

function sensitiveAreas(issue: JiraIssue): SensitiveArea[] {
  const haystack = [...issue.labels, ...issue.components, issue.summary]
    .join(' ')
    .toLowerCase();
  const areas: SensitiveArea[] = [];
  if (/\b(auth|login|log[- ]?in|sso|mfa|session|password|sign[- ]?up|signup|register)\b/.test(haystack)) areas.push('auth');
  if (/\b(payment|checkout|billing|card)\b/.test(haystack)) areas.push('payments');
  if (/\b(pii|gdpr|personal[- ]?data|privacy)\b/.test(haystack)) areas.push('personal_data');
  if (/\b(ui|frontend|page|screen|form|component)\b/.test(haystack)) areas.push('ui');
  return areas;
}

/**
 * Map a Jira issue onto a portal Story. When `existing` is provided (matched
 * by jiraKey) its gate progress (status, DoR/DoD checks) is preserved and only
 * descriptive fields refresh.
 */
export function mapIssueToStory(issue: JiraIssue, existing?: Story): Story {
  const now = new Date().toISOString();
  const descriptive = {
    title: issue.summary,
    description: issue.description,
    type: storyType(issue),
    module: issue.components[0]?.toLowerCase() ?? issue.labels[0]?.toLowerCase() ?? 'general',
    priority: issue.priority ? (PRIORITY_MAP[issue.priority.toLowerCase()] ?? 'P2') : null,
    touches: sensitiveAreas(issue),
    jiraKey: issue.key,
  };

  if (existing) {
    return { ...existing, ...descriptive, updatedAt: now };
  }
  return {
    id: randomUUID(),
    ...descriptive,
    status: 'in_readiness_review', // lands at DoR Gate 1 (§2.1)
    edgeCases: [],
    dorChecks: {},
    dodChecks: {},
    dodVerified: {},
    createdAt: now,
    updatedAt: now,
  };
}
