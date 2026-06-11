import { describe, expect, it } from 'vitest';
import { computeDdi } from '../src/engines/ddi.js';

describe('Defect Density Index (§7.2)', () => {
  it('weights defects by severity: critical 5, high 3, medium 2, low 1', () => {
    // (5 + 3 + 2 + 1) / 4 stories = 2.75
    const r = computeDdi(
      [{ severity: 'critical' }, { severity: 'high' }, { severity: 'medium' }, { severity: 'low' }],
      4,
    );
    expect(r.ddi).toBe(2.75);
    expect(r.band).toBe('high');
  });

  it('≥2.5 → high: always P2, escalate to QE Lead', () => {
    const r = computeDdi([{ severity: 'critical' }], 2); // 2.5
    expect(r.band).toBe('high');
    expect(r.regressionScope).toMatch(/Always P2/);
  });

  it('1.0–2.4 → medium: included in P2 risk-based scope', () => {
    const r = computeDdi([{ severity: 'medium' }], 2); // 1.0
    expect(r.band).toBe('medium');
  });

  it('<1.0 → low: P3 only unless directly changed', () => {
    const r = computeDdi([{ severity: 'low' }], 2); // 0.5
    expect(r.band).toBe('low');
    expect(r.regressionScope).toMatch(/P3 only/);
  });

  it('no deliveries + defects → treated as high (unmeasurable hot spot)', () => {
    expect(computeDdi([{ severity: 'low' }], 0).band).toBe('high');
  });

  it('no deliveries + no defects → 0 / low', () => {
    const r = computeDdi([], 0);
    expect(r.ddi).toBe(0);
    expect(r.band).toBe('low');
  });
});
