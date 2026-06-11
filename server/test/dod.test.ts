import { describe, expect, it } from 'vitest';
import { dodChecklistFor, devSelfCertify, qeVerify } from '../src/engines/dod.js';

const checkAll = (type: Parameters<typeof dodChecklistFor>[0], owner?: 'dev' | 'qa' | 'po') =>
  Object.fromEntries(
    dodChecklistFor(type)
      .filter((i) => !owner || i.owner === owner)
      .map((i) => [i.id, true]),
  );

describe('DoD dual verification (§4)', () => {
  it('feature DoD = 8 baseline + 9 extensions', () => {
    expect(dodChecklistFor('feature')).toHaveLength(17);
    expect(dodChecklistFor('bug')).toHaveLength(15);
    expect(dodChecklistFor('tech_debt')).toHaveLength(14);
  });

  it('Stage 1: Dev cannot submit until ALL Dev-owned items are checked', () => {
    const partial = checkAll('feature', 'dev');
    delete (partial as Record<string, boolean>)['unit_tests'];
    const r = devSelfCertify('feature', partial);
    expect(r.complete).toBe(false);
    expect(r.missing.map((m) => m.id)).toContain('unit_tests');
  });

  it('Stage 1: complete when every Dev-owned item is checked (QA items irrelevant)', () => {
    const r = devSelfCertify('feature', checkAll('feature', 'dev'));
    expect(r.complete).toBe(true);
  });

  it('Stage 2: QE must verify EVERY item — any failure blocks Ready for Release', () => {
    const verified = checkAll('bug');
    verified['no_new_defects'] = false;
    const r = qeVerify('bug', verified);
    expect(r.passed).toBe(false);
    expect(r.unverified.map((u) => u.id)).toEqual(['no_new_defects']);
    expect(r.message).toMatch(/Blocked/);
  });

  it('Stage 2: passes only when all items independently verified', () => {
    const r = qeVerify('tech_debt', checkAll('tech_debt'));
    expect(r.passed).toBe(true);
  });
});
