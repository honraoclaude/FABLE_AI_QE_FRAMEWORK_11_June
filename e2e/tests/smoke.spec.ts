// P1 smoke — core journeys that must work no matter what (§7.3).
// Failure of any test here blocks the release immediately.

import { expect, test } from '@playwright/test';

test.describe('P1 smoke: portal core journeys', () => {
  test('API health check responds', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toMatchObject({ ok: true });
  });

  test('story pipeline loads with seeded stories', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('QE Intelligence Portal')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Story Pipeline' })).toBeVisible();
    await expect(page.getByRole('table').first()).toBeVisible();
  });

  test('DoR check produces a scored result with owner-assigned gaps', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Check DoR' }).first().click();
    await expect(page.locator('.badge.bad, .badge.warn, .badge.ok').first()).toBeVisible();
  });

  test('AC generation produces Gherkin scenarios', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Generate AC' }).first().click();
    await expect(page.getByRole('heading', { name: /Acceptance Criteria/ })).toBeVisible();
    await expect(page.getByText('Given', { exact: false }).first()).toBeVisible();
  });

  test('Product Owner dashboard loads and switches sub-views', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Product Owner' }).click();
    // Executive hero + premium KPI cards render from the scored backlog
    await expect(page.getByRole('heading', { name: 'Product Owner Intelligence Hub' })).toBeVisible();
    await expect(page.getByText('INVEST Health')).toBeVisible();
    // Switch to a sub-view that exercises a POST endpoint
    await page.getByRole('tab', { name: 'Sprint Builder' }).click();
    await expect(page.getByText(/weeks selected/)).toBeVisible();
  });

  test('3 Amigos evaluator raises owned actions', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: '3 Amigos' }).click();
    await page.getByRole('button', { name: 'Evaluate story' }).first().click();
    await expect(page.getByText(/INVEST:/).first()).toBeVisible();
  });

  test('risk register renders scored risks', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Risk Register' }).click();
    await expect(page.getByRole('heading', { name: 'Product Risk Register' })).toBeVisible();
  });

  test('RBT framework generates from product context', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'RBT Testing' }).click();
    await page.getByLabel('Product name').fill('PayFlow');
    await page.getByLabel('Key business processes (comma-separated)').fill('Onboarding, Payments');
    await page.getByLabel('Key integrations (comma-separated)').fill('Stripe');
    await page.getByLabel('Regulatory requirements (comma-separated)').fill('GDPR');
    await page.getByRole('button', { name: 'Generate RBT framework' }).click();
    await expect(page.getByRole('heading', { name: 'Executive summary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Product risk register/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Download risk register CSV/ })).toBeVisible();
  });

  test('go/no-go scorecard computes a recommendation', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Go / No-Go' }).click();
    await page.getByRole('button', { name: 'Compute scorecard' }).click();
    await expect(page.locator('.scorebox')).toContainText('/100');
  });
});
