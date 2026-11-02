import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
test('public NFL exploration, comparisons, search, and mobile navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Setting the standard' })).toBeVisible();
  await page.getByLabel('Statistics season').selectOption('2024');
  await expect(page.getByText('4,918', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Players', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search players' }).fill('Joe Burrow');
  await expect(page.getByRole('link', { name: 'JB Joe Burrow' })).toBeVisible();
  await page.getByRole('link', { name: 'JB Joe Burrow' }).click();
  await expect(page.getByRole('heading', { name: 'Joe Burrow', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Passing yards by week/ })).toBeVisible();
  await page.getByRole('link', { name: 'Compare', exact: true }).first().click();
  await page.getByLabel('First comparison selection').selectOption({ label: 'Joe Burrow · QB' });
  await page.getByLabel('Second comparison selection').selectOption({ label: 'Josh Allen · QB' });
  await expect(page.getByRole('heading', { name: 'Josh Allen', exact: true })).toBeVisible();
  await expect(page.locator('.comparison-row').first()).toContainText('4,918');
  await page.getByRole('textbox', { name: 'Search teams, players and communities' }).fill('Chiefs');
  await page.getByRole('textbox', { name: 'Search teams, players and communities' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Results for “Chiefs”' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kansas City Chiefs' }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Setting the standard' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Teams', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The league, at a glance.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('register, verify, sign in, follow, join, post, comment, poll, and sign out', async ({
  page,
}) => {
  const name = 'fan_' + Date.now(),
    email = name + '@example.com',
    password = 'Browser test password 123!';
  await page.goto('/register');
  await page.getByRole('textbox', { name: /Username/ }).fill(name);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Check your email to verify your account.' }),
  ).toBeVisible();
  const messages = (await fs.readFile(process.env.E2E_DATA_DIR + '/mailbox.ndjson', 'utf8'))
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const mail = messages.filter((m) => m.to === email).at(-1);
  const link = mail.text.split('\n').find((s: string) => s.startsWith('http'));
  await page.goto(link);
  await page.getByRole('button', { name: 'Verify my email' }).click();
  await expect(page.getByRole('status')).toContainText('Email verified.');
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, ' + name + '.' })).toBeVisible();
  await page.goto('/teams');
  await page.getByRole('button', { name: 'Follow KC', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unfollow KC' })).toBeVisible();
  await page.goto('/favorites');
  await expect(page.getByRole('heading', { name: 'Kansas City Chiefs' })).toBeVisible();
  await page.goto('/communities');
  await expect(page.getByRole('heading', { name: 'My Favorite Teams' })).toBeVisible();
  await page.getByText('Add NFL teams', { exact: true }).click();
  await page.getByRole('button', { name: 'Follow BUF', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unfollow BUF', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'KC Kansas City Chiefs', exact: true }).click();
  await expect(page.getByLabel('Team season')).toHaveValue('2026');
  await page.goto('/communities/kc');
  await page.getByRole('button', { name: 'Join community', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Joined · Leave' })).toBeVisible();
  await page.getByRole('button', { name: 'New discussion' }).click();
  await page.getByLabel('Title', { exact: true }).fill('What makes a great football community?');
  await page
    .getByLabel('Your take', { exact: true })
    .fill('Good data and respectful conversation.');
  await page.getByRole('button', { name: 'Publish discussion' }).click();
  await page.getByRole('link', { name: 'What makes a great football community?' }).click();
  await page.getByLabel('Add your perspective').fill('Agreed. Context matters.');
  const refreshedComments = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      /\/api\/posts\/[^/]+$/.test(new URL(response.url()).pathname),
  );
  await page.getByRole('button', { name: 'Post comment' }).click();
  expect((await refreshedComments).ok()).toBe(true);
  await expect(page.getByText('Agreed. Context matters.', { exact: true })).toBeVisible();
  await page.goto('/communities/kc');
  await page.getByRole('button', { name: 'Create a poll' }).click();
  await page.getByLabel('Question', { exact: true }).fill('Your favorite football topic?');
  await page.getByLabel(/Answers/).fill('Offense\nDefense');
  await page.getByLabel('Closes at (your local time)').fill('2027-01-01T12:00');
  await page.getByRole('button', { name: 'Create poll', exact: true }).click();
  await page.getByRole('button', { name: 'Offense 0%' }).click();
  await expect(page.getByRole('button', { name: 'Offense 100%' })).toBeVisible();
  await page.goto('/profile');
  await page.getByLabel('Biography').fill('Football, data, and good conversation.');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status')).toContainText('Your profile is updated.');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible();
});
test('dashboard and account forms have no WCAG A or AA automated violations', async ({ page }) => {
  for (const route of ['/', '/register']) {
    await page.goto(route);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForTimeout(400);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  }
});

test('weekly schedules and latest team pages support historical selection on mobile', async ({
  page,
}) => {
  await page.goto('/games');
  await expect(page.getByLabel('Schedule season')).toHaveValue('2026');
  await expect(
    page.getByRole('heading', { name: 'Kansas City Chiefs', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Schedule week').selectOption('18');
  await expect(page.getByText('Statistics unavailable.', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Schedule season').selectOption('2024');
  await page.getByLabel('Season phase').selectOption('POST');
  await expect(page.locator('.game-card').first()).toContainText('Postseason');
  await page.getByLabel('Statistics season').selectOption('2024');
  await page.goto('/teams/KC');
  await expect(page.getByLabel('Team season')).toHaveValue('2026');
  await expect(page.getByText('Full available roster', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Season statistics unavailable', { exact: true }).first(),
  ).toBeVisible();
  await page.getByLabel('Team season').selectOption('2024');
  await expect(page.getByText('Partial roster', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Team season').selectOption('2026');
  await expect(page.getByText('Full available roster', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/games');
  await expect(
    page.getByRole('heading', { name: 'Kansas City Chiefs', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
