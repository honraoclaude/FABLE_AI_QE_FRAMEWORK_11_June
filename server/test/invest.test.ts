import { describe, expect, it } from 'vitest';
import { assessInvest } from '../src/engines/invest.js';
import { generateScenariosTemplate } from '../src/engines/ac.js';
import type { Story } from '../src/types.js';

function story(overrides: Partial<Story> = {}): Story {
  return {
    id: 's1',
    title: 'Apply discount code',
    description:
      'As a shopper I want to apply a discount code at checkout so that I save money on my order. Codes are validated against the campaign service.',
    type: 'feature',
    status: 'backlog',
    module: 'checkout',
    priority: 'P1',
    touches: [],
    edgeCases: ['expired code'],
    dorChecks: {},
    dodChecks: {},
    dodVerified: {},
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const byLetter = (a: ReturnType<typeof assessInvest>) =>
  Object.fromEntries(a.criteria.map((c) => [c.letter, c]));

describe('INVEST assessment', () => {
  it('returns exactly one criterion per letter', () => {
    const a = assessInvest(story());
    expect(a.criteria.map((c) => c.letter)).toEqual(['I', 'N', 'V', 'E', 'S', 'T']);
  });

  it('a well-formed story with AC is strong', () => {
    const s = story();
    const a = assessInvest(s, generateScenariosTemplate(s));
    expect(a.verdict).toBe('strong');
    expect(a.criteria.every((c) => c.status === 'pass')).toBe(true);
  });

  it('I: dependency language → warn with split suggestion', () => {
    const a = assessInvest(story({ description: 'Blocked by SCRUM-42. Depends on the pricing service rewrite.' }));
    expect(byLetter(a)['I']?.status).toBe('warn');
    expect(byLetter(a)['I']?.suggestion).toMatch(/split|re-order/i);
  });

  it('N: implementation mandates → warn', () => {
    const a = assessInvest(story({ description: 'Must use Redis pub/sub so that updates propagate.' }));
    expect(byLetter(a)['N']?.status).toBe('warn');
  });

  it('V: missing value statement → fail; missing priority downgrades', () => {
    const noWhy = assessInvest(story({ description: 'Add a button to the page that does the thing properly.' }));
    expect(byLetter(noWhy)['V']?.status).toBe('fail');

    const noPriority = assessInvest(story({ priority: null }));
    expect(byLetter(noPriority)['V']?.status).toBe('warn');
  });

  it('E: thin description → fail; TBDs → warn', () => {
    expect(byLetter(assessInvest(story({ description: 'Fix it' })))['E']?.status).toBe('fail');
    expect(
      byLetter(assessInvest(story({ description: 'Apply discount so that totals update. Rounding rules TBD.' })))['E']
        ?.status,
    ).toBe('warn');
  });

  it("S: compound title with 'and' or scope-creep language → warn", () => {
    expect(byLetter(assessInvest(story({ title: 'Apply discount and redesign cart' })))['S']?.status).toBe('warn');
    expect(
      byLetter(assessInvest(story({ description: 'Complete rewrite of the entire checkout so that it is modern.' })))[
        'S'
      ]?.status,
    ).toBe('warn');
  });

  it('T: no AC and none drafted → fail; AC scenarios present → pass', () => {
    const s = story();
    expect(byLetter(assessInvest(s, []))['T']?.status).toBe('fail');
    expect(byLetter(assessInvest(s, generateScenariosTemplate(s)))['T']?.status).toBe('pass');
  });

  it('T: subjective adjectives without thresholds → warn even with AC', () => {
    const s = story({ description: 'Checkout should feel fast and intuitive so that shoppers convert.' });
    const a = assessInvest(s, generateScenariosTemplate(s));
    expect(byLetter(a)['T']?.status).toBe('warn');
  });

  it('verdict: any fail → weak; only warns → acceptable', () => {
    expect(assessInvest(story({ description: 'Fix it' })).verdict).toBe('weak');
    expect(assessInvest(story({ title: 'Discount and cart', dorChecks: { ac_drafted: true } })).verdict).toBe(
      'acceptable',
    );
  });
});
