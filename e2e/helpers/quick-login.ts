import type { Page } from '@playwright/test';

export type DemoAccount = 'alex' | 'worker' | 'admin';

const LABELS: Record<DemoAccount, string> = {
  alex: 'Alex',
  worker: 'Worker',
  admin: 'Admin',
};

/** Development-only UI helper. Delete with the quick-login feature. */
export async function quickLogin(page: Page, account: DemoAccount) {
  await page.goto('/login');
  await page.getByRole('button', { name: LABELS[account] }).click();
}
