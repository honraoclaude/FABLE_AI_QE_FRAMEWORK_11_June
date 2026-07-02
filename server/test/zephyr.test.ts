import { describe, expect, it } from 'vitest';
import { syncFromZephyr, zephyrConfigFromEnv, type ZephyrConfig } from '../src/integrations/zephyr.js';

const cfg: ZephyrConfig = { baseUrl: 'https://api.zephyrscale.smartbear.com/v2', token: 't', projectKey: 'SCRUM' };

function fakeFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (url: Parameters<typeof fetch>[0]) => {
    const u = String(url);
    const key = Object.keys(routes).find((k) => u.includes(k));
    if (!key) throw new Error(`unmocked url: ${u}`);
    return { ok: true, status: 200, json: async () => routes[key], text: async () => '' } as unknown as Response;
  }) as typeof fetch;
}

describe('Zephyr Scale adapter', () => {
  it('config requires the token; defaults base URL and project', () => {
    expect(zephyrConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    const c = zephyrConfigFromEnv({ ZEPHYR_API_TOKEN: 'x' } as NodeJS.ProcessEnv);
    expect(c?.baseUrl).toMatch(/smartbear\.com\/v2$/);
    expect(c?.projectKey).toBe('SCRUM');
  });

  it('maps cases + executions: last-fail, flaky (mixed last 5), smoke/automated from labels', async () => {
    const result = await syncFromZephyr(cfg, fakeFetch({
      '/testcases': {
        values: [
          { id: 1, key: 'SCRUM-T1', name: 'Login smoke test', labels: ['smoke', 'automated', 'auth'] },
          { id: 2, key: 'SCRUM-T2', name: 'Discount rounding', labels: ['checkout'] },
          { id: 3, key: 'SCRUM-T3', name: 'Report export', labels: [] },
        ],
        isLast: true,
      },
      '/testexecutions': {
        values: [
          // T1: pass then fail then pass → flaky, last = pass
          { id: 11, testCase: { id: 1 }, testExecutionStatus: { id: 100 }, actualEndDate: '2026-06-20' },
          { id: 12, testCase: { id: 1 }, testExecutionStatus: { id: 200 }, actualEndDate: '2026-06-18' },
          { id: 13, testCase: { id: 1 }, testExecutionStatus: { id: 100 }, actualEndDate: '2026-06-15' },
          // T2: failed most recently
          { id: 14, testCase: { id: 2 }, testExecutionStatus: { id: 200 }, actualEndDate: '2026-06-21' },
        ],
        isLast: true,
      },
      '/statuses': { values: [{ id: 100, name: 'Pass' }, { id: 200, name: 'Fail' }], isLast: true },
    }));

    expect(result.caseCount).toBe(3);
    const byId = Object.fromEntries(result.tests.map((t) => [t.id, t]));

    const t1 = byId['zephyr-SCRUM-T1']!;
    expect(t1.smoke).toBe(true);
    expect(t1.automated).toBe(true);
    expect(t1.module).toBe('smoke'); // first label
    expect(t1.history.flaky).toBe(true);
    expect(t1.history.failedInLastRelease).toBe(false); // last execution passed

    const t2 = byId['zephyr-SCRUM-T2']!;
    expect(t2.history.failedInLastRelease).toBe(true);
    expect(t2.history.flaky).toBe(false);

    const t3 = byId['zephyr-SCRUM-T3']!;
    expect(t3.history.failedInLastRelease).toBe(false); // no executions
    expect(t3.tags).toContain('zephyr');
  });
});
