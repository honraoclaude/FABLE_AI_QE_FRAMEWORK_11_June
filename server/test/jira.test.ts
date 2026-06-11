import { describe, expect, it } from 'vitest';
import {
  adfToText,
  fetchJiraIssues,
  jiraConfigFromEnv,
  mapIssueToStory,
  type JiraConfig,
  type JiraIssue,
} from '../src/integrations/jira.js';
import type { Story } from '../src/types.js';

const cfg: JiraConfig = {
  baseUrl: 'https://example.atlassian.net',
  email: 'qa@example.com',
  apiToken: 'token',
  jql: 'status = "Refinement"',
};

function jiraIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    key: 'QE-1',
    summary: 'A story',
    description: 'Details',
    issueType: 'Story',
    priority: 'Medium',
    labels: [],
    components: [],
    ...overrides,
  };
}

const fakeFetch = (pages: unknown[]): typeof fetch => {
  let call = 0;
  return (async (url: Parameters<typeof fetch>[0]) => {
    const body = pages[call++];
    return {
      ok: true,
      status: 200,
      url: String(url),
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  }) as typeof fetch;
};

describe('Jira config', () => {
  it('returns null when env vars are missing', () => {
    expect(jiraConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('builds config with default refinement JQL', () => {
    const c = jiraConfigFromEnv({
      JIRA_BASE_URL: 'https://x.atlassian.net/',
      JIRA_EMAIL: 'a@b.c',
      JIRA_API_TOKEN: 't',
    } as NodeJS.ProcessEnv);
    expect(c?.baseUrl).toBe('https://x.atlassian.net'); // trailing slash stripped
    expect(c?.jql).toMatch(/Refinement/);
  });
});

describe('ADF → text', () => {
  it('extracts text from nested Atlassian Document Format', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Line one' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Line two' }] },
      ],
    };
    expect(adfToText(adf)).toBe('Line one\nLine two\n');
  });

  it('handles plain strings and null', () => {
    expect(adfToText('plain')).toBe('plain');
    expect(adfToText(null)).toBe('');
  });
});

describe('fetchJiraIssues', () => {
  it('follows nextPageToken pagination and maps fields', async () => {
    const pages = [
      {
        issues: [
          {
            key: 'QE-1',
            fields: {
              summary: 'First',
              description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Desc' }] }] },
              issuetype: { name: 'Bug' },
              priority: { name: 'High' },
              labels: ['auth'],
              components: [{ name: 'Login' }],
            },
          },
        ],
        nextPageToken: 'tok2',
        isLast: false,
      },
      {
        issues: [{ key: 'QE-2', fields: { summary: 'Second' } }],
        isLast: true,
      },
    ];
    const issues = await fetchJiraIssues(cfg, fakeFetch(pages));
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      key: 'QE-1',
      summary: 'First',
      description: 'Desc',
      issueType: 'Bug',
      priority: 'High',
      components: ['Login'],
    });
    expect(issues[1]?.key).toBe('QE-2');
  });

  it('throws a clear error on a non-OK response', async () => {
    const failingFetch = (async () =>
      ({ ok: false, status: 401, text: async () => 'unauthorised' }) as unknown as Response) as typeof fetch;
    await expect(fetchJiraIssues(cfg, failingFetch)).rejects.toThrow(/401/);
  });
});

describe('mapIssueToStory', () => {
  it('new issues land in readiness review (DoR Gate 1)', () => {
    const story = mapIssueToStory(jiraIssue());
    expect(story.status).toBe('in_readiness_review');
    expect(story.jiraKey).toBe('QE-1');
  });

  it('maps issue type: Bug → bug, tech-debt label → tech_debt, else feature', () => {
    expect(mapIssueToStory(jiraIssue({ issueType: 'Bug' })).type).toBe('bug');
    expect(mapIssueToStory(jiraIssue({ labels: ['tech-debt'] })).type).toBe('tech_debt');
    expect(mapIssueToStory(jiraIssue()).type).toBe('feature');
  });

  it('maps priority names to P1/P2/P3', () => {
    expect(mapIssueToStory(jiraIssue({ priority: 'Highest' })).priority).toBe('P1');
    expect(mapIssueToStory(jiraIssue({ priority: 'Medium' })).priority).toBe('P2');
    expect(mapIssueToStory(jiraIssue({ priority: 'Lowest' })).priority).toBe('P3');
    expect(mapIssueToStory(jiraIssue({ priority: null })).priority).toBeNull();
  });

  it('infers sensitive areas from labels/components/summary', () => {
    const story = mapIssueToStory(
      jiraIssue({ summary: 'New checkout payment form', labels: ['ui'], components: [] }),
    );
    expect(story.touches).toContain('payments');
    expect(story.touches).toContain('ui');
  });

  it('password/signup stories are tagged auth', () => {
    const story = mapIssueToStory(
      jiraIssue({ summary: 'Display password strength while typing on signup' }),
    );
    expect(story.touches).toContain('auth');
  });

  it('re-sync preserves gate progress on existing stories', () => {
    const existing: Story = {
      ...mapIssueToStory(jiraIssue()),
      status: 'qe_verification',
      dorChecks: { title_clear: true },
      dodChecks: { unit_tests: true },
      edgeCases: ['offline'],
    };
    const updated = mapIssueToStory(jiraIssue({ summary: 'Renamed in Jira' }), existing);
    expect(updated.id).toBe(existing.id);
    expect(updated.title).toBe('Renamed in Jira');
    expect(updated.status).toBe('qe_verification'); // progress preserved
    expect(updated.dorChecks).toEqual({ title_clear: true });
    expect(updated.edgeCases).toEqual(['offline']);
  });
});
