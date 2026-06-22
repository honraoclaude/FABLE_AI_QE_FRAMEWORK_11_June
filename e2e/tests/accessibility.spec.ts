// Accessibility gate — WCAG 2.1 AA via axe-core (§11).
// Zero critical violations is a hard blocker at go/no-go.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const TABS = [
  'Story Pipeline',
  'Product Owner',
  '3 Amigos',
  'Product Risk Register',
  'RBT Testing Approach',
  'Regression Pack',
  'Go / No-Go',
  'Quality Metrics',
];

test.describe('WCAG 2.1 AA — automated axe-core scan', () => {
  for (const tab of TABS) {
    test(`${tab} view has no critical or serious violations`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('tab', { name: tab }).click();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(
        blocking,
        blocking.map((v) => `${v.id}: ${v.description}`).join('\n'),
      ).toEqual([]);
    });
  }
});
