// Zephyr Scale (Cloud) adapter — pulls real test cases and execution history
// into the portal's regression test store, replacing seeded data. Execution
// history drives the previously-failed / flaky signals that feed the
// risk-based regression packs (§7.4) and the auto Go/No-Go P1/P2 signals.
//
// API: https://api.zephyrscale.smartbear.com/v2 with a Bearer JWT
// (Jira → Apps → Zephyr Scale → API Access Tokens).

export interface ZephyrConfig {
  baseUrl: string;
  token: string;
  projectKey: string;
}

export function zephyrConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ZephyrConfig | null {
  if (!env.ZEPHYR_API_TOKEN) return null;
  return {
    baseUrl: (env.ZEPHYR_BASE_URL ?? 'https://api.zephyrscale.smartbear.com/v2').replace(/\/+$/, ''),
    token: env.ZEPHYR_API_TOKEN,
    projectKey: env.ZEPHYR_PROJECT_KEY ?? 'SCRUM',
  };
}

interface ZephyrTestCase {
  id: number;
  key: string; // e.g. SCRUM-T1
  name: string;
  labels?: string[];
  folder?: { id: number } | null;
  priority?: { id: number } | null;
}

interface ZephyrExecution {
  id: number;
  testCase: { id: number; self?: string };
  testExecutionStatus: { id: number; self?: string };
  actualEndDate?: string | null;
}

interface ZephyrStatus {
  id: number;
  name: string; // Pass / Fail / Blocked / Not Executed / In Progress
}

async function zGet<T>(cfg: ZephyrConfig, path: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${cfg.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Zephyr ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function zPaged<T>(cfg: ZephyrConfig, path: string, fetchImpl: typeof fetch): Promise<T[]> {
  const out: T[] = [];
  let startAt = 0;
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await zGet<{ values: T[]; isLast: boolean; maxResults: number }>(
      cfg, `${path}${sep}maxResults=100&startAt=${startAt}`, fetchImpl,
    );
    out.push(...page.values);
    if (page.isLast || page.values.length === 0) break;
    startAt += page.values.length;
  }
  return out;
}

export interface ZephyrSyncResult {
  tests: import('../types.js').TestCase[];
  caseCount: number;
  executionCount: number;
}

const SMOKE_RE = /\bsmoke\b|\bp1\b|\bcritical path\b/i;
const AUTOMATED_RE = /\bautomat/i;

/**
 * Fetch test cases + executions and map to portal TestCases.
 * Flaky = both pass and fail within the last 5 executions.
 * failedInLastRelease = most recent execution failed.
 */
export async function syncFromZephyr(cfg: ZephyrConfig, fetchImpl: typeof fetch = fetch): Promise<ZephyrSyncResult> {
  const [cases, executions, statuses] = await Promise.all([
    zPaged<ZephyrTestCase>(cfg, `/testcases?projectKey=${cfg.projectKey}`, fetchImpl),
    zPaged<ZephyrExecution>(cfg, `/testexecutions?projectKey=${cfg.projectKey}`, fetchImpl),
    zPaged<ZephyrStatus>(cfg, `/statuses?projectKey=${cfg.projectKey}&statusType=TEST_EXECUTION`, fetchImpl),
  ]);

  const statusName = new Map(statuses.map((s) => [s.id, s.name.toLowerCase()]));
  // Executions grouped per test case, newest first.
  const byCase = new Map<number, ZephyrExecution[]>();
  for (const ex of executions) {
    const list = byCase.get(ex.testCase.id) ?? [];
    list.push(ex);
    byCase.set(ex.testCase.id, list);
  }
  for (const list of byCase.values()) {
    list.sort((a, b) => (b.actualEndDate ?? '').localeCompare(a.actualEndDate ?? ''));
  }

  const isFail = (ex: ZephyrExecution) => (statusName.get(ex.testExecutionStatus.id) ?? '').includes('fail');
  const isPass = (ex: ZephyrExecution) => (statusName.get(ex.testExecutionStatus.id) ?? '').includes('pass');

  const tests = cases.map((tc) => {
    const hist = (byCase.get(tc.id) ?? []).slice(0, 5);
    const last = hist[0];
    const failedInLastRelease = last ? isFail(last) : false;
    const flaky = hist.some(isFail) && hist.some(isPass);
    const labelText = `${tc.name} ${(tc.labels ?? []).join(' ')}`;
    return {
      id: `zephyr-${tc.key}`,
      name: `${tc.key} ${tc.name}`,
      module: (tc.labels ?? [])[0]?.toLowerCase() ?? cfg.projectKey.toLowerCase(),
      smoke: SMOKE_RE.test(labelText),
      tags: ['zephyr', ...(tc.labels ?? []).map((l) => l.toLowerCase())],
      automated: AUTOMATED_RE.test(labelText),
      history: {
        failedInLastRelease,
        lastFailedReleasesAgo: failedInLastRelease ? 1 : hist.some(isFail) ? 2 : null,
        flaky,
        fixedButHighRiskArea: false,
        sprintsSinceLastFailure: hist.length > 0 && !hist.some(isFail) ? 6 : null,
      },
    };
  });

  return { tests, caseCount: cases.length, executionCount: executions.length };
}
