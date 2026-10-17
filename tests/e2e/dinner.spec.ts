import { test, expect, type ElectronApplication } from '@playwright/test';
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
