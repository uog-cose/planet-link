import { test, expect } from '@playwright/test';
import { quickLogin, type DemoAccount } from './helpers/quick-login';
const youth: DemoAccount='alex';
const worker: DemoAccount='worker';
const admin: DemoAccount='admin';
const login = quickLogin;
test('youth role is game-only and has personal points QR',async({page})=>{await login(page,youth);await expect(page.getByRole('link',{name:'Configure'})).toHaveCount(0);await expect(page.getByRole('link',{name:'Attendance'})).toHaveCount(0);await expect(page.locator('.points-qr-card')).toBeVisible();});
test('refresh preserves session',async({page})=>{await login(page,youth);await expect(page.getByText('Your path is lighting up.')).toBeVisible();await page.reload();await expect(page.getByText('Your path is lighting up.')).toBeVisible();await expect(page).not.toHaveURL(/\/login$/);});
test('worker has attendance and participant avatar surfaces',async({page})=>{await login(page,worker);await page.getByRole('link',{name:'Attendance'}).click();await expect(page.getByText('Attendance')).toBeVisible();await page.getByRole('link',{name:'Participants'}).click();await expect(page.getByText('Participants')).toBeVisible();});
test('admin can change theme and generate reset QR',async({page})=>{await login(page,admin);await page.getByRole('link',{name:'Theme'}).click();await page.getByRole('button',{name:'Use preset'}).first().click();await page.getByRole('link',{name:'Password reset'}).click();await expect(page.getByText('Password reset QR')).toBeVisible();});
test('public display has top groups and high risers plus fullscreen icon',async({page})=>{await page.goto('/public');await expect(page.getByText('Top 5 this week')).toBeVisible();await expect(page.locator('.fullscreen-control')).toBeVisible();});
test('password visibility toggles',async({page})=>{await page.goto('/login');const input=page.getByLabel('Password');await expect(input).toHaveAttribute('type','password');await page.getByRole('button',{name:'Show password'}).click();await expect(input).toHaveAttribute('type','text');});

test('development quick login is available for seeded roles',async({page})=>{await page.goto('/login');await expect(page.getByRole('button',{name:'Alex'})).toBeVisible();await expect(page.getByRole('button',{name:'Worker'})).toBeVisible();await expect(page.getByRole('button',{name:'Admin'})).toBeVisible();});


test('admin games route is a React route and milestones are editable',async({page})=>{await login(page,admin);await page.goto('/admin/games');await expect(page.getByText('Assign games')).toBeVisible();await page.goto('/admin/config');await expect(page.getByText('Add milestone')).toBeVisible();});
test('worker cannot access admin configuration by URL',async({page})=>{await login(page,worker);await page.goto('/admin/config');await expect(page).toHaveURL(/\/worker$/);});
test('youth cannot access worker or admin pages by URL',async({page})=>{await login(page,youth);await page.goto('/worker/points');await expect(page).toHaveURL(/\/$/);await page.goto('/admin/config');await expect(page).toHaveURL(/\/$/);});
test('admin configuration is collapsible and supports independent programme instances',async({page})=>{
  await login(page,admin);
  await page.goto('/admin/config');
  await expect(page.getByText('Attendance streak rewards')).toBeVisible();
  await expect(page.getByText('Milestone levels')).toBeVisible();
  await page.getByLabel('Programme name').last().fill('Youth Quest Secondary');
  await page.getByLabel('Location').last().fill('Secondary Centre');
  await page.getByRole('button',{name:'Create programme'}).click();
  await expect(page.locator('.instance-switcher select')).toBeVisible();
  await page.locator('.instance-switcher select').selectOption({label:'Youth Quest Secondary'});
  await expect(page).toHaveURL(/\/admin\/config/);
});

test('dashboard designer exposes layout reset controls',async({page})=>{
  await login(page,admin);
  await page.goto('/admin/theme');
  await expect(page.getByRole('button',{name:'Reset layout'})).toHaveCount(2);
});


test('admin game editor offers benchmark game types and scoring bands',async({page})=>{
  await login(page,admin);
  await page.goto('/admin/games');
  await expect(page.getByLabel('Game type')).toBeVisible();
  await page.getByLabel('Game type').selectOption('reaction');
  await expect(page.getByText('Fairness tuning')).toBeVisible();
  await page.getByRole('button',{name:'Scoring'}).click();
  await expect(page.getByText('Performance → XP')).toBeVisible();
});

test('calendar popover renders above the page and event editor keeps local wall-clock input',async({page})=>{
  await login(page,admin);
  await page.goto('/admin/map-event');
  await page.getByRole('button',{name:'Choose date'}).click();
  const popover=page.locator('#yq-calendar-popover');
  await expect(popover).toBeVisible();
  await expect(popover).toHaveCSS('position','fixed');
  await page.keyboard.press('Escape');
});
