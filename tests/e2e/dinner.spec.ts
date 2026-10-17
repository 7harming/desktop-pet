import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { calmPetPage, cardPacks, cardPage, cardUserDir, controllerCall, launch, readLog, readNotes } from './helpers';

const isOpen = (app: ElectronApplication) => controllerCall(app, c => c.cards.open.has('dinner'));

test('the dinner wheel is a third card: in the menu and the panel, 242 px beside the 186 px reminders', async () => {
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, cardUserDir());
  await calmPetPage(app);
  expect(await controllerCall(app, c => c.cards.menuItems())).toEqual([
    { kind: 'todo', label: '提醒事項' }, { kind: 'memo', label: '備忘錄' }, { kind: 'dinner', label: '今晚吃什麼' }]);
  expect(await controllerCall(app, c => c.cards.title('dinner'))).toBe('測試貓的晚餐轉盤');
  await controllerCall(app, c => { c.cards.show('todo', null, 'hand'); c.cards.show('dinner', null, 'hand'); });
  await cardPage(app, 'todo');
  const card = await cardPage(app, 'dinner');
  await expect(card.locator('#title')).toHaveText('今晚吃什麼');
  const [todo, dinner] = await controllerCall(app, c => [c.cards.open.get('todo').card.placed, c.cards.open.get('dinner').card.placed]);
  expect(todo.width).toBe(186);
  expect(dinner.width).toBe(242);
  const [l, r] = todo.x < dinner.x ? [todo, dinner] : [dinner, todo];
  expect(r.x).toBe(l.x + l.width);
  await app.close();
});

test('a spin picks a dish, waits for the cat at most 4 s, and is recorded once the card says the wheel stopped', async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  await calmPetPage(app);
  await controllerCall(app, c => c.cards.show('dinner', null, 'hand'));
  await cardPage(app, 'dinner');
  await controllerCall(app, c => c.cards.act({ kind: 'spin' }));
  const spin = await controllerCall(app, c => c.cards.state('dinner').dinner.spin);
  expect(spin).toMatchObject({ started: false });
  // a second press while it waits changes nothing
  await controllerCall(app, c => c.cards.act({ kind: 'spin' }));
  expect(await controllerCall(app, c => c.cards.state('dinner').dinner.spin.seq)).toBe(spin.seq);
  await expect.poll(() => controllerCall(app, c => c.cards.state('dinner').dinner.spin?.started), { timeout: 6_000 }).toBe(true);
  const dish = await controllerCall(app, c => c.cards.spin.dish);
  expect(readLog(userDir)).toContain(`轉盤：轉到 ${dish}`);
  const seq = await controllerCall(app, c => c.cards.spin.seq);
  await controllerCall(app, new Function('c', `return c.cards.act({ kind: 'spun', seq: ${seq} })`) as any);
  await expect.poll(() => readNotes(userDir)?.dinner?.last?.dish, { timeout: 5_000 }).toBe(dish);
  expect(readLog(userDir)).toContain(`轉盤：今晚吃 ${dish}`);
  expect(await controllerCall(app, c => c.cards.state('dinner').dinner.spin)).toBeNull();
  await app.close();
});

/** The dish under the pointer, worked out from how far the wheel has turned. */
const dishUnderPointer = (card: Page) => card.evaluate(() => {
  const turned = Number(/rotate\(([-\d.]+)deg\)/.exec((document.querySelector('.disc') as SVGElement).style.transform)?.[1] ?? 0);
  const names = [...document.querySelectorAll('.disc .name')].map(t => t.textContent);
  return names[Math.floor((((360 - (turned % 360)) % 360) / (360 / names.length)))];
});

test('the card turns the wheel to the dish main picked, and its zoomed page fits its window', async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  await calmPetPage(app);
  await controllerCall(app, c => c.cards.show('dinner', null, 'hand'));
  const card = await cardPage(app, 'dinner');
  await expect(card.locator('.disc .name')).toHaveText(['便當', '牛肉麵', '滷肉飯', '水餃', '拉麵', '火鍋', '咖哩飯', '炒飯']);
  expect(await card.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await card.locator('button.spin').click();
  await expect(card.locator('button.spin')).toBeDisabled();
  await expect(card.locator('button.edit-menu')).toBeDisabled();
  await expect(card.locator('.result')).toHaveText(/^今晚吃：/, { timeout: 15_000 });
  const dish = (await card.locator('.result').textContent())!.replace('今晚吃：', '');
  expect(await dishUnderPointer(card)).toBe(dish);
  await expect.poll(() => readNotes(userDir)?.dinner?.last?.dish, { timeout: 5_000 }).toBe(dish);
  await expect(card.locator('button.spin')).toBeEnabled();
  await app.close();
});

test('the menu is changed on the back of the card and kept; what breaks the rules shows in red', async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  await calmPetPage(app);
  await controllerCall(app, c => c.cards.show('dinner', null, 'hand'));
  const card = await cardPage(app, 'dinner');
  await card.locator('button.edit-menu').click();
  await card.locator('input.new-dish').fill('麥當勞');
  await card.locator('input.new-dish').press('Enter');
  await card.locator('input.new-dish').fill('便當');
  await card.locator('button.plus').click();
  await expect(card.locator('.error')).toHaveText('已經有了');
  await card.locator('.dishes .text', { hasText: '水餃' }).click();
  await card.locator('.dishes input.edit').fill('鍋貼');
  await card.locator('.dishes input.edit').press('Enter');
  const hotpot = card.locator('.dishes li', { hasText: '火鍋' });
  await hotpot.hover();
  await hotpot.locator('.del').click();
  const after = ['便當', '牛肉麵', '滷肉飯', '鍋貼', '拉麵', '咖哩飯', '炒飯', '麥當勞'];
  await expect(card.locator('.dishes .text')).toHaveText(after);
  await expect.poll(() => readNotes(userDir)?.dinner?.items, { timeout: 5_000 }).toEqual(after);
  await card.locator('button.done').click();
  await expect(card.locator('.disc .name')).toHaveText(after);
  // down to two, and no further
  await controllerCall(app, c => { c.cards.notes.dinner.items = ['便當', '拉麵']; c.cards.push('dinner'); });
  await card.locator('button.edit-menu').click();
  const first = card.locator('.dishes li').first();
  await first.hover();
  await first.locator('.del').click();
  await expect(card.locator('.error')).toHaveText('至少要留兩樣');
  await expect(card.locator('.dishes .text')).toHaveText(['便當', '拉麵']);
  await app.close();
});

test("yesterday's dish is greyed, and the wheel does not stop on it", async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  await calmPetPage(app);
  // yesterday as helloDay counts it: the date 29 hours ago (days start at 5:00)
  await controllerCall(app, c => {
    const t = new Date(Date.now() - 29 * 3600_000);
    c.cards.notes.dinner = { items: ['便當', '拉麵'], last: { day: `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`, dish: '拉麵' }, prev: null };
    c.cards.show('dinner', null, 'hand');
  });
  const card = await cardPage(app, 'dinner');
  await expect(card.locator('.slice.old')).toHaveCount(1);
  await expect(card.locator('.yesterday')).toHaveText('昨天');
  await card.locator('button.spin').click();
  await expect(card.locator('.result')).toHaveText('今晚吃：便當', { timeout: 15_000 });
  expect(await dishUnderPointer(card)).toBe('便當');
  await app.close();
});
