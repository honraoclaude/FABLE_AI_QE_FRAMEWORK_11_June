import { describe, expect, it } from 'vitest';
import { DOR_GLOBAL_BASELINE, dorChecklistFor, scoreDor } from '../src/engines/dor.js';

const allChecked = (type: Parameters<typeof dorChecklistFor>[0]) =>
  Object.fromEntries(dorChecklistFor(type).map((c) => [c.id, true]));

describe('DoR scoring (§2)', () => {
  it('has the 8-item global baseline', () => {
    expect(DOR_GLOBAL_BASELINE).toHaveLength(8);
  });

  it('feature checklist = baseline + 5 extensions', () => {
    expect(dorChecklistFor('feature')).toHaveLength(13);
    expect(dorChecklistFor('bug')).toHaveLength(14);
    expect(dorChecklistFor('tech_debt')).toHaveLength(13);
  });

  it('100% → ready, eligible for 3 Amigos', () => {
    const r = scoreDor('feature', allChecked('feature'));
    expect(r.score).toBe(100);
    expect(r.status).toBe('ready');
    expect(r.gaps).toHaveLength(0);
  });

  it('80–99% → conditionally ready (QE Lead decides)', () => {
    const checks = allChecked('bug');
    checks['affected_version'] = false; // 13/14 ≈ 93%
    const r = scoreDor('bug', checks);
    expect(r.status).toBe('conditionally_ready');
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.score).toBeLessThan(100);
  });

  it('<80% → not ready, blocked from 3 Amigos', () => {
    const r = scoreDor('feature', {});
    expect(r.score).toBe(0);
    expect(r.status).toBe('not_ready');
    expect(r.action).toMatch(/Blocked/);
  });

  it('gaps are auto-assigned to owners', () => {
    const checks = allChecked('feature');
    checks['priority_assigned'] = false;
    checks['external_deps_noted'] = false;
    const r = scoreDor('feature', checks);
    const owners = Object.fromEntries(r.gaps.map((g) => [g.id, g.owner]));
    expect(owners['priority_assigned']).toBe('PO');
    expect(owners['external_deps_noted']).toBe('Dev');
  });
});
