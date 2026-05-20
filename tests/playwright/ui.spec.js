const { test, expect } = require('@playwright/test');

test.describe('ChronoLens basic UI', () => {
  test('homepage loads and shows main heading and categories', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ChronoLens/);
    await expect(page.getByRole('heading', { name: 'ChronoLens' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Technology/ })).toBeVisible();
  });

  test('technology category expands and shows events', async ({ page }) => {
    await page.goto('/');
    const techButton = page.getByRole('button', { name: /Technology/ });
    await techButton.click();
    // Expect at least one known event title to appear
    await expect(page.getByRole('heading', { name: /The Lindbergh Transatlantic Flight/ })).toBeVisible();
  });

  test('content-admin loads and shows cache stats', async ({ page }) => {
    await page.goto('/content-admin');
    await expect(page.getByRole('heading', { name: 'Content Administration' })).toBeVisible();
    await expect(page.getByText('Cache Statistics')).toBeVisible();
  });
});
