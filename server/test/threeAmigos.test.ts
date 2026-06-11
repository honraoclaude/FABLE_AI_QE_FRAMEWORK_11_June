import { describe, expect, it } from 'vitest';
import { assessInvest } from '../src/engines/invest.js';
import { canMarkComplete, deriveActions, evaluateThreeAmigos, INVEST_OWNER } from '../src/engines/threeAmigos.js';
import type { ActionItem, Story } from '../src/types.js';

function story(overrides: Partial<Story> = {}): Story {
  return {
    id: 's1',
    title: 'Apply discount code',
    description: 'As a shopper I want to apply a discount code so that I save money. Validated against campaigns.',
    type: 'feature',
    status: 'backlog',
    module: 'checkout',
    priority: 'P1',
    touches: [],
    edgeCases: [],
    dorChecks: {},
    dodChecks: {},
    dodVerified: {},
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

/** A story that fails V (no value/priority) and E (thin) and T (no AC) */
const weakStory = () => story({ title: 'Task 1', description: '', priority: null });

describe('3 Amigos evaluator (§3)', () => {
  it('weak INVEST criteria become owned actions; passes do not', () => {
    const s = weakStory();
    const actions = deriveActions(assessInvest(s));
    const ids = actions.map((a) => a.id);
    expect(ids).toContain('invest-V');
    expect(ids).toContain('invest-E');
    expect(ids).toContain('invest-T');
    expect(ids).not.toContain('invest-I'); // passing criterion → no action
  });

  it('owner mapping: V → PO, T → QA, E/N/S → BA, I → Dev', () => {
    expect(INVEST_OWNER.V).toBe('PO');
    expect(INVEST_OWNER.T).toBe('QA');
    expect(INVEST_OWNER.E).toBe('BA');
    expect(INVEST_OWNER.I).toBe('Dev');

    const actions = deriveActions(assessInvest(weakStory()));
    const owners = Object.fromEntries(actions.map((a) => [a.id, a.owner]));
    expect(owners['invest-V']).toBe('PO');
    expect(owners['invest-T']).toBe('QA');
  });

  it('fail → blocker severity, warn → attention', () => {
    const actions = deriveActions(assessInvest(weakStory()));
    const byId = Object.fromEntries(actions.map((a) => [a.id, a]));
    expect(byId['invest-V']?.severity).toBe('blocker'); // V fails (no why + no priority)
    expect(byId['invest-N']?.severity).toBe('attention'); // N warns (no description)
  });

  it('re-evaluation preserves done status and drops resolved actions', () => {
    const s = weakStory();
    const first = deriveActions(assessInvest(s));
    const previous: ActionItem[] = first.map((a) => (a.id === 'invest-V' ? { ...a, done: true } : a));

    // PO fixed value + priority; description now estimable
    const improved = story({
      title: 'Task 1',
      description: 'As an admin I want audit logging so that compliance reviews are possible. Covers create/update.',
      priority: 'P2',
    });
    const second = deriveActions(assessInvest(improved), previous);
    const ids = second.map((a) => a.id);
    expect(ids).not.toContain('invest-V'); // resolved — dropped
    expect(ids).not.toContain('invest-E'); // resolved — dropped
    expect(ids).toContain('invest-T'); // still no AC
    expect(second.find((a) => a.id === 'invest-T')?.done).toBe(false); // not previously done
  });

  it('evaluation reports open actions and readiness', () => {
    const s = weakStory();
    const ev = evaluateThreeAmigos(s, assessInvest(s));
    expect(ev.ready).toBe(false);
    expect(ev.openActions).toBeGreaterThan(0);
    expect(ev.message).toMatch(/open action/);
  });

  it('complete gate blocks while actions are open and allows when all done', () => {
    const s = weakStory();
    s.actions = deriveActions(assessInvest(s));
    expect(canMarkComplete(s).allowed).toBe(false);
    expect(canMarkComplete(s).reason).toMatch(/open action/);

    s.actions = s.actions.map((a) => ({ ...a, done: true }));
    expect(canMarkComplete(s).allowed).toBe(true);
  });

  it('a strong story yields zero actions and is immediately ready', () => {
    const s = story({ dorChecks: { ac_drafted: true } });
    const ev = evaluateThreeAmigos(s, assessInvest(s));
    expect(ev.actions).toHaveLength(0);
    expect(ev.ready).toBe(true);
  });
});
