import { describe, expect, it } from 'vitest';
import {
  addJiraComment,
  createJiraSubtask,
  formatAcComment,
  textToAdf,
  transitionJiraIssue,
} from '../src/integrations/jira-write.js';
import type { JiraConfig } from '../src/integrations/jira.js';

const cfg: JiraConfig = {
  baseUrl: 'https://example.atlassian.net',
  email: 'qa@example.com',
  apiToken: 'token',
  jql: 'project = X',
};

type Captured = { url: string; method?: string; body?: unknown };

function fakeFetch(responses: unknown[], captured: Captured[]): typeof fetch {
  let call = 0;
  return (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    captured.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const body = responses[call++];
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
  }) as typeof fetch;
}

describe('textToAdf', () => {
  it('one paragraph per line, empty lines preserved', () => {
    const adf = textToAdf('line one\n\nline two') as { type: string; content: { type: string; content: unknown[] }[] };
    expect(adf.type).toBe('doc');
    expect(adf.content).toHaveLength(3);
    expect(adf.content[1]?.content).toHaveLength(0); // blank line
  });
});

describe('formatAcComment', () => {
  it('renders numbered Gherkin scenarios with source attribution', () => {
    const body = formatAcComment(
      [{ title: 'Happy path', kind: 'happy', gherkin: { given: 'a user', when: 'they act', then: 'it works' } }],
      'template',
    );
    expect(body).toMatch(/deterministic template/);
    expect(body).toMatch(/1\. \[HAPPY\] Happy path/);
    expect(body).toMatch(/Given a user/);
  });
});

describe('addJiraComment', () => {
  it('POSTs an ADF body to the comment endpoint', async () => {
    const captured: Captured[] = [];
    const result = await addJiraComment(cfg, 'SCRUM-8', 'hello', fakeFetch([{ id: '10001' }], captured));
    expect(result.id).toBe('10001');
    expect(captured[0]?.url).toBe('https://example.atlassian.net/rest/api/3/issue/SCRUM-8/comment');
    expect(captured[0]?.method).toBe('POST');
    expect((captured[0]?.body as { body: { type: string } }).body.type).toBe('doc');
  });
});

describe('createJiraSubtask', () => {
  it('derives project key from the parent and creates a Subtask', async () => {
    const captured: Captured[] = [];
    const result = await createJiraSubtask(cfg, 'SCRUM-5', '[PO] Add value statement', 'details', fakeFetch([{ key: 'SCRUM-99' }], captured));
    expect(result.key).toBe('SCRUM-99');
    const fields = (captured[0]?.body as { fields: Record<string, unknown> }).fields;
    expect(fields.project).toEqual({ key: 'SCRUM' });
    expect(fields.parent).toEqual({ key: 'SCRUM-5' });
    expect(fields.issuetype).toEqual({ name: 'Subtask' });
    expect(fields.summary).toBe('[PO] Add value statement');
  });
});

describe('transitionJiraIssue', () => {
  const transitions = {
    transitions: [
      { id: '11', name: 'Start', to: { name: 'In Progress' } },
      { id: '21', name: 'Finish', to: { name: 'Done' } },
    ],
  };

  it('matches the target status case-insensitively and POSTs the transition id', async () => {
    const captured: Captured[] = [];
    const result = await transitionJiraIssue(cfg, 'SCRUM-5', 'in progress', fakeFetch([transitions, {}], captured));
    expect(result.transitioned).toBe('In Progress');
    expect((captured[1]?.body as { transition: { id: string } }).transition.id).toBe('11');
  });

  it('lists available targets when the status is unreachable', async () => {
    await expect(
      transitionJiraIssue(cfg, 'SCRUM-5', 'Ready for Test', fakeFetch([transitions], [])),
    ).rejects.toThrow(/Available: In Progress, Done/);
  });
});
