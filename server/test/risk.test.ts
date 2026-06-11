import { describe, expect, it } from 'vitest';
import { moduleRiskScores, RISK_TYPES, scoreRisk } from '../src/engines/risk.js';

describe('Risk scoring matrix (§6.3)', () => {
  it('defines all 8 risk types', () => {
    expect(RISK_TYPES).toHaveLength(8);
  });

  it('score = severity × likelihood', () => {
    expect(scoreRisk(3, 4).score).toBe(12);
    expect(scoreRisk(1, 1).score).toBe(1);
  });

  it('1–3 → low / monitor', () => {
    const r = scoreRisk(1, 3);
    expect(r.band).toBe('low');
    expect(r.action).toBe('Monitor');
    expect(r.notifyQeLead).toBe(false);
  });

  it('4–6 → medium / assign mitigation', () => {
    expect(scoreRisk(2, 2).band).toBe('medium');
    expect(scoreRisk(2, 3).band).toBe('medium');
  });

  it('≥8 → high / immediate action + QE Lead notified', () => {
    const r = scoreRisk(2, 4);
    expect(r.band).toBe('high');
    expect(r.notifyQeLead).toBe(true);
    expect(scoreRisk(3, 3).band).toBe('high');
    expect(scoreRisk(4, 4).band).toBe('high');
  });

  it('rejects out-of-range inputs', () => {
    expect(() => scoreRisk(0, 2)).toThrow();
    expect(() => scoreRisk(2, 5)).toThrow();
    expect(() => scoreRisk(1.5, 2)).toThrow();
  });

  it('module aggregation takes the highest OPEN risk per module', () => {
    const scores = moduleRiskScores([
      { module: 'checkout', score: 6, status: 'open' },
      { module: 'checkout', score: 9, status: 'open' },
      { module: 'checkout', score: 12, status: 'closed' },
      { module: 'auth', score: 4, status: 'open' },
    ]);
    expect(scores['checkout']).toBe(9);
    expect(scores['auth']).toBe(4);
  });
});
