import {test,expect} from '@playwright/test';
import {quickLogin} from './helpers/quick-login';

test.describe('Youth Quest reliability flows',()=>{
  test('worker group award confirms the resolved member count',async({page})=>{
    await quickLogin(page,'worker');
    await page.goto('/worker/points');
    const group=page.getByLabel('Group').first();
    await group.click();
    const options=page.locator('.search-select-menu button');
    await expect(options.first()).toBeVisible();
    await options.first().click();
    await page.getByRole('button',{name:'Award points'}).click();
    await expect(page.getByRole('dialog')).toContainText('young people');
    await page.getByRole('button',{name:'Award to group'}).click();
    await expect(page.locator('.toast')).toContainText(/young people updated|players updated/i);
  });

  test('admin can save a human-readable map key',async({page})=>{
    await quickLogin(page,'admin');
    await page.goto('/admin/map-event');
    await page.getByLabel('Map access key').fill('QUEST26');
    await page.getByRole('button',{name:'Save expiry'}).click();
    await expect(page.getByText(/Key: QUEST26/)).toBeVisible();
    await expect(page.getByRole('button',{name:'Copy private link'})).toBeEnabled();
  });

  test('public map route accepts the short access key',async({page})=>{
    await quickLogin(page,'admin');
    const csrf=await page.evaluate(()=>document.cookie.split('; ').find(x=>x.startsWith('csrftoken='))?.split('=')[1]||'');
    const created=await page.evaluate(async({csrf})=>{
      const future=new Date(Date.now()+15*60_000);
      const end=new Date(Date.now()+2*60*60_000);
      const pad=(n:number)=>String(n).padStart(2,'0');
      const local=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const r=await fetch('/api/map-event/',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-CSRFToken':decodeURIComponent(csrf)},body:JSON.stringify({title:'E2E Map Event',locationName:'E2E',postcode:'EH1 1YZ',address:'E2E address',lat:55.9533,lng:-3.1883,startAt:local(future),endAt:local(end),visible:true,pinEnabled:true})});
      return {ok:r.ok,body:await r.json()};
    },{csrf});
    expect(created.ok).toBeTruthy();
    await page.goto('/admin/map-event');
    const timelineRow=page.locator('.map-event-timeline-card .event-timeline-row').filter({hasText:'E2E Map Event'});
    await expect(timelineRow).toBeVisible();
    const summaryWidth=await timelineRow.locator('summary').evaluate(el=>el.getBoundingClientRect().width);
    expect(summaryWidth).toBeGreaterThan(300);
    await page.getByLabel('Map access key').fill('QUEST26');
    await page.getByRole('button',{name:'Save expiry'}).click();
    await page.goto('/public/map/1/QUEST26');
    await expect(page.getByText('Event location is restricted')).toHaveCount(0);
    await expect(page.locator('.leaflet-container')).toBeVisible();
  });

  test('youth notification centre remains available after a refresh',async({page})=>{
    await quickLogin(page,'alex');
    await page.goto('/notifications');
    await expect(page.getByRole('heading',{name:'Your notifications'})).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading',{name:'Your notifications'})).toBeVisible();
  });
});


test('logged-out root makes no protected API requests',async({page})=>{
  const protectedRequests:string[]=[];
  page.on('request',req=>{const url=req.url();if(url.includes('/api/')&&!/\/api\/(csrf|auth\/(login|me|refresh|logout)|public\/)/.test(url))protectedRequests.push(`${req.method()} ${url}`)});
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.waitForTimeout(500);
  expect(protectedRequests).toEqual([]);
});

test('public page is the only logged-out route allowed to call public APIs',async({page})=>{
  const publicRequests:string[]=[];
  page.on('request',req=>{if(req.url().includes('/api/public/'))publicRequests.push(req.url())});
  await page.goto('/public');
  await expect(page).toHaveURL(/\/public/);
  await expect.poll(()=>publicRequests.length).toBeGreaterThan(0);
});


test('young person dashboard restores the points QR and opens it as a modal',async({page})=>{
  await quickLogin(page,'alex');
  await page.goto('/');
  await expect(page.getByText('Your points QR')).toBeVisible();
  await expect(page.getByRole('button',{name:'Show QR'})).toBeVisible();
  await page.getByRole('button',{name:'Show QR'}).click();
  await expect(page.getByRole('dialog',{name:'Your points QR'})).toBeVisible();
  await expect(page.locator('.points-qr-backdrop')).toBeVisible();
  await page.mouse.click(8,8);
  await expect(page.getByRole('dialog',{name:'Your points QR'})).toHaveCount(0);
});


test("worker attendance QR scans successfully from the young person's browser",async({page,browser})=>{
  await quickLogin(page,'worker');
  await page.goto('/attendance');
  const sessionResponse=page.waitForResponse(r=>r.url().includes('/api/attendance/session/')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Generate QR'}).click();
  const session=await (await sessionResponse).json();
  expect(session.token).toBeTruthy();
  expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now()+55*60_000);

  const youthContext=await browser.newContext({baseURL:'http://localhost:5174'});
  try {
    const youthPage=await youthContext.newPage();
    await youthPage.goto(`/check-in?token=${encodeURIComponent(session.token)}`);
    await expect(youthPage).toHaveURL(/\/login$/,{timeout:15000});
    await youthPage.getByRole('button',{name:'Alex'}).click();
    await expect(youthPage.getByRole('heading',{name:'Attendance recorded'})).toBeVisible({timeout:15000});
    await expect(youthPage.getByText('Attendance recorded for today.')).toBeVisible();
    await youthPage.reload();
    await expect(youthPage.getByText(/already been recorded today/i)).toBeVisible({timeout:15000});
  } finally {
    await youthContext.close();
  }
});


test('scratch card setup supports XP-only prizes and no expiry',async({page})=>{
  await quickLogin(page,'worker');
  await page.goto('/worker/scratch-cards');
  await page.getByRole('button',{name:/Create scratch card/}).click();
  await expect(page.getByText('Never expires')).toBeVisible();
  const fields=page.locator('.scratch-prize-row label');
  await expect(fields.nth(0)).toContainText('Type');
  await expect(fields.nth(1)).toContainText('Prize');
  await page.getByLabel('Type').selectOption('xp');
  await expect(page.getByLabel('Prize (optional)')).not.toHaveAttribute('required','');
  await page.getByLabel('Never expires').check();
  await expect(page.getByText('This scratch card stays active until staff deactivate or delete it.')).toBeVisible();
});
