import { describe, expect, it } from 'vitest';
import { mapIssueToRawStory, syncPoBacklogFromJira, type PoJiraConfig } from '../src/po-jira.js';
import { scoreStories } from '../src/engines/backlog.js';

function adf(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

function issue(key: string, fields: Record<string, unknown>) {
  return { key, fields };
}

describe('Jira → backlog story mapping', () => {
  it('derives story type FIX from a Bug and COMPLY from compliance keywords', () => {
    const bug = mapIssueToRawStory(issue('SCRUM-1', { summary: 'Login error', issuetype: { name: 'Bug' } }), null);
    expect(bug.story.storyType).toBe('FIX');

    const comply = mapIssueToRawStory(
      issue('SCRUM-2', { summary: 'FCA audit trail for suitability', issuetype: { name: 'Story' }, labels: ['compliance'] }),
      null,
    );
    expect(comply.story.storyType).toBe('COMPLY');
    expect(comply.story.regulated).toBe(true);
  });

  it('derives INVEST from description / AC / user-story format', () => {
    const rich = mapIssueToRawStory(
      issue('SCRUM-3', {
        summary: 'Lead scoring',
        issuetype: { name: 'Story' },
        priority: { name: 'High' },
        description: adf('As a sales manager I want lead scoring so that high-intent leads are prioritised. Given a new lead When scored Then routed. Given invalid When scored Then error. Given duplicate When scored Then merged.'),
      }),
      null,
    );
    // user-story format + "so that" + 3 Gherkin Thens → strong V and T
    expect(rich.story.invest.V).toBe(5);
    expect(rich.story.invest.T).toBe(5);
    expect(rich.story.acCount).toBeGreaterThanOrEqual(3);
    expect(rich.story.impact).toBe(3); // High priority

    const thin = mapIssueToRawStory(issue('SCRUM-4', { summary: 'Do the thing', issuetype: { name: 'Task' } }), null);
    expect(thin.story.invest.E).toBeLessThanOrEqual(3); // no description → low estimability
    expect(thin.story.acCount).toBe(0);
  });

  it('reads story points into effort when the field is configured', () => {
    const m = mapIssueToRawStory(
      issue('SCRUM-5', { summary: 'Big story', issuetype: { name: 'Story' }, customfield_10016: 8 }),
      'customfield_10016',
    );
    expect(m.story.effort).toBe(8);
    expect(m.story.invest.S).toBe(2); // large effort → low "Small" score
  });

  it('extracts dependencies from "is blocked by" issue links', () => {
    const m = mapIssueToRawStory(
      issue('SCRUM-6', {
        summary: 'Dependent story',
        issuetype: { name: 'Story' },
        issuelinks: [{ type: { inward: 'is blocked by' }, inwardIssue: { key: 'SCRUM-1' } }],
      }),
      null,
    );
    expect(m.story.dependencies).toContain('SCRUM-1');
  });

  it('syncs a backlog and keeps only in-set dependencies, then scores cleanly', async () => {
    const pages = [
      {
        issues: [
          issue('SCRUM-1', { summary: 'Lead scoring engine', issuetype: { name: 'Story' }, priority: { name: 'High' }, description: adf('As a manager I want scoring so that leads convert. Given X When Y Then Z.') }),
          issue('SCRUM-2', { summary: 'FCA audit log', issuetype: { name: 'Story' }, labels: ['fca', 'compliance'], issuelinks: [{ type: { inward: 'is blocked by' }, inwardIssue: { key: 'SCRUM-1' } }, { type: { inward: 'is blocked by' }, inwardIssue: { key: 'GONE-9' } }] }),
        ],
        isLast: true,
      },
    ];
    let call = 0;
    const fakeFetch = (async () => ({ ok: true, status: 200, json: async () => pages[call++], text: async () => '' }) as unknown as Response) as typeof fetch;
    const cfg: PoJiraConfig = { baseUrl: 'https://x.atlassian.net', email: 'a@b.c', apiToken: 't', jql: 'project = SCRUM', storyPointsField: null };

    const { stories, votes } = await syncPoBacklogFromJira(cfg, fakeFetch);
    expect(stories).toHaveLength(2);
    // GONE-9 is not in the set, so it is dropped; SCRUM-1 is kept
    const audit = stories.find((s) => s.id === 'SCRUM-2')!;
    expect(audit.dependencies).toEqual(['SCRUM-1']);
    expect(audit.storyType).toBe('COMPLY');
    // mapped stories score without error and rank cleanly
    const scored = scoreStories(stories, votes);
    expect(scored.map((s) => s.rank)).toEqual([1, 2]);
    expect(scored.every((s) => s.health >= 0 && s.health <= 100)).toBe(true);
  });
});
