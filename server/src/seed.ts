// Demo seed data so the dashboard and e2e smoke tests have something to show.

import { randomUUID } from 'node:crypto';
import type { Repo } from './db.js';
import type { Story, TestCase } from './types.js';
import { scoreRisk } from './engines/risk.js';

export function seedIfEmpty(repo: Repo): boolean {
  if (repo.listStories().length > 0) return false;
  const now = new Date().toISOString();

  const stories: Omit<Story, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      title: 'Checkout — apply discount code',
      description: 'Customers can apply a percentage or fixed discount code at checkout.',
      type: 'feature',
      status: 'ready_for_3_amigos',
      module: 'checkout',
      priority: 'P1',
      touches: ['payments', 'ui'],
      edgeCases: ['expired code', 'stacked codes', 'code on zero-value cart'],
      dorChecks: {},
      dodChecks: {},
      dodVerified: {},
    },
    {
      title: 'Login fails with valid MFA token',
      description: 'Users with TOTP MFA intermittently rejected. Repro on Safari 17.',
      type: 'bug',
      status: 'in_development',
      module: 'auth',
      priority: 'P1',
      touches: ['auth'],
      edgeCases: ['clock drift', 'token reuse window'],
      dorChecks: {},
      dodChecks: {},
      dodVerified: {},
    },
    {
      title: 'Migrate session store to Redis cluster',
      description: 'Current single-node Redis is a fragility hotspot under load.',
      type: 'tech_debt',
      status: 'backlog',
      module: 'platform',
      priority: 'P2',
      touches: [],
      edgeCases: ['failover mid-session'],
      dorChecks: {},
      dodChecks: {},
      dodVerified: {},
    },
  ];
  for (const s of stories) {
    repo.saveStory({ ...s, id: randomUUID(), createdAt: now, updatedAt: now });
  }

  const risks: { type: 'security' | 'regression' | 'performance'; module: string; description: string; severity: number; likelihood: number }[] = [
    { type: 'security', module: 'auth', description: 'MFA bypass risk if token reuse window is too generous', severity: 4, likelihood: 2 },
    { type: 'regression', module: 'checkout', description: 'Discount logic interacts with pricing engine — high blast radius', severity: 3, likelihood: 3 },
    { type: 'performance', module: 'platform', description: 'No perf baseline for session store under peak load', severity: 2, likelihood: 2 },
  ];
  for (const risk of risks) {
    repo.saveRisk({
      id: randomUUID(),
      ...risk,
      ...scoreRisk(risk.severity, risk.likelihood),
      mitigation: null,
      source: 'qe_manual',
      status: 'open',
      createdAt: now,
    });
  }

  const tests: Omit<TestCase, 'id'>[] = [
    { name: 'Smoke: login → dashboard', module: 'auth', smoke: true, tags: [], automated: true, history: blankHistory() },
    { name: 'Smoke: add to cart → checkout → pay', module: 'checkout', smoke: true, tags: [], automated: true, history: blankHistory() },
    { name: 'Discount code applies percentage', module: 'checkout', smoke: false, tags: ['regression'], automated: true, history: { ...blankHistory(), failedInLastRelease: true } },
    { name: 'Session survives node restart', module: 'platform', smoke: false, tags: [], automated: false, history: { ...blankHistory(), flaky: true } },
    { name: 'Profile page renders order history', module: 'profile', smoke: false, tags: [], automated: true, history: { ...blankHistory(), sprintsSinceLastFailure: 9 } },
  ];
  for (const t of tests) repo.saveTest({ ...t, id: randomUUID() });

  repo.saveDefect({
    id: randomUUID(),
    module: 'checkout',
    severity: 'high',
    title: 'Discount applied twice on browser back',
    foundIn: 'testing',
    status: 'open',
    createdAt: now,
  });

  return true;
}

function blankHistory(): TestCase['history'] {
  return {
    failedInLastRelease: false,
    lastFailedReleasesAgo: null,
    flaky: false,
    fixedButHighRiskArea: false,
    sprintsSinceLastFailure: null,
  };
}
