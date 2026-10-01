import { test, expect, type ElectronApplication } from '@playwright/test';
import { calmPetPage, cardPacks, cardPage, cardUserDir, catPoint, controllerCall, launch, panelPage, petPage, readLog, readNotes } from './helpers';

// controllerCall sends the function's source to the main process, so it can not close over `kind`
const isOpen = (app: ElectronApplication, kind: 'memo' | 'todo') =>
  controllerCall(app, kind === 'todo' ? c => c.cards.open.has('todo') : c => c.cards.open.has('memo'));

test('scrolling up over a cat brings its card over its head, and scrolling down puts it away', async () => {
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, cardUserDir());
  const page = await calmPetPage(app);   // testcat holds the reminders
  const p = await catPoint(page, 0.35, 0.7);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, -100);
  const card = await cardPage(app, 'todo');
  await expect(card.locator('#title')).toHaveText('測試貓的提醒事項');
  const [bounds, head] = await controllerCall(app, c => [c.cards.open.get('todo').card.win.getBounds(), c.cards.heads.get('testcat')]);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(head.y - 79);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => isOpen(app, 'todo')).toBe(false);
  await app.close();
});

test('the memo is typed on the card over its own cat and kept in notes.json', async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  await petPage(app);
  await controllerCall(app, c => c.showPet('testcat2'));
  await petPage(app, 'testcat2');
  await controllerCall(app, c => c.cards.show('memo', 'testcat', 'hand'));
  const card = await cardPage(app, 'memo');
  expect(await controllerCall(app, c => c.cards.open.get('memo').petId)).toBe('testcat2');   // over its own cat
  await card.locator('textarea').fill('要買貓砂');
  await expect.poll(() => readNotes(userDir)?.memo, { timeout: 5_000 }).toBe('要買貓砂');
  await app.close();
});

test('a reminder added on the card, and one that falls due: the cat sits up, ticking it puts the card away', async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  const page = await calmPetPage(app);
  await controllerCall(app, c => c.cards.show('todo', null, 'hand'));
  const card = await cardPage(app, 'todo');
  await card.locator('select.hour').selectOption('7');
  await card.locator('select.minute').selectOption('30');
  await card.locator('select.repeat').selectOption('daily');
  await card.locator('input.new-text').fill('吃藥');
  await card.locator('input.new-text').press('Enter');
  await expect(card.locator('li .text')).toHaveText(['吃藥']);
  await expect(card.locator('li .time')).toHaveText(['07:30']);
  await expect(card.locator('li .tag')).toHaveText(['每天']);
  await expect.poll(() => readNotes(userDir)?.todos?.length, { timeout: 5_000 }).toBe(1);
  // a one-off that fell due a second ago
  await controllerCall(app, c => {
    const now = Date.now();
    c.cards.notes.todos.push({ id: 'due1', text: '開會', hour: 15, minute: 0, repeat: 'once', at: now - 1000, doneDay: null, firedAt: null });
    c.cards.tick(now);
  });
  await expect(card.locator('li.due .text')).toHaveText('開會');
  await expect(card.locator('li.due button')).toHaveCount(1);   // just its delete: ticking it is the answer
  // it came up once: it is marked so, and does not come up again even if left unticked
  await expect.poll(() => readNotes(userDir)?.todos?.find((t: any) => t.id === 'due1')?.firedAt, { timeout: 5_000 }).toBeGreaterThan(0);
  await controllerCall(app, c => c.cards.tick(Date.now() + 60_000));
  expect(readLog(userDir).split('提醒事項到了').length - 1).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.endPose), { timeout: 20_000 }).toBe('sit');
  await card.locator('li.due input[type=checkbox]').click();   // (not check(): ticked, it is no longer li.due)
  await expect(card.locator('li.done .text')).toHaveText('開會');
  await controllerCall(app, c => c.cards.setHot('todo', false));   // the pointer leaves the card
  await expect.poll(() => isOpen(app, 'todo'), { timeout: 10_000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.endPose), { timeout: 20_000 }).toBe('rest');
  await app.close();
});

test('the cards pop up when the app starts, once the cats are home, only once in a while, and go by themselves', async () => {
  const userDir = cardUserDir({ memo: { start: true, unlock: true }, todo: { start: true } });
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks(), DESKTOP_PET_CARD_SECONDS: '2' }, userDir);
  await expect.poll(() => controllerCall(app, c => !!c)).toBe(true);
  await controllerCall(app, c => c.showPet('testcat2'));
  await cardPage(app, 'todo');
  await cardPage(app, 'memo');
  await controllerCall(app, c => c.cards.popFor('unlock'));   // right after: the same pop
  const log = readLog(userDir);
  expect(log.split('卡片：memo 自動跳出').length - 1).toBe(1);
  expect(log).toContain('卡片：todo 自動跳出（start）');
  await controllerCall(app, c => { c.cards.setHot('todo', false); c.cards.setHot('memo', false); });
  await expect.poll(() => isOpen(app, 'memo'), { timeout: 10_000 }).toBe(false);
  await expect.poll(() => isOpen(app, 'todo'), { timeout: 10_000 }).toBe(false);
  await app.close();
});

test('back at the computer the cat sits up, then its memo pops up', async () => {
  const userDir = cardUserDir({ memo: { back: true } });
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  await petPage(app);
  await controllerCall(app, c => { c.hidePet('testcat'); c.showPet('testcat2'); });
  const page = await calmPetPage(app, 'testcat2');
  await controllerCall(app, c => { c.idleSeconds = () => 3600; });
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.endPose), { timeout: 20_000 }).toBe('perch');
  await controllerCall(app, c => { c.idleSeconds = () => 0; });
  await cardPage(app, 'memo');
  expect(await page.evaluate(() => (window as any).__pet.engine.endPose)).toBe('sit');
  expect(readLog(userDir)).toContain('卡片：memo 自動跳出（back）');
  await app.close();
});

test('the panel sets when each card pops up by itself', async () => {
  const userDir = cardUserDir({ todo: { start: true } });
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  await petPage(app);
  await controllerCall(app, c => c.openPanel());
  const panel = await panelPage(app);
  await panel.locator('.tab[data-tab="cards"]').click();
  const todo = panel.locator('[data-card="todo"]');
  await todo.locator('input[data-trigger="start"]').uncheck();
  await todo.locator('input.daily-on').check();   // every day: off in these settings, so its time can not be picked yet
  await todo.locator('select.daily-hour').selectOption('8');
  await todo.locator('select.daily-minute').selectOption('40');
  await expect.poll(() => controllerCall(app, c => c.settings.cards.todo)).toMatchObject({ start: false, daily: 8 * 60 + 40 });
  await app.close();
});
