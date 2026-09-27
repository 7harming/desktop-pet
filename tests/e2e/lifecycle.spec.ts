import { test, expect } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { controllerCall, launch, panelPage, petPage } from './helpers';

test('the first run opens the panel once and remembers it', async () => {
  const userDir = mkdtempSync(join(tmpdir(), 'dpet-first-'));
  const first = await launch({}, userDir);
  await panelPage(first.app);
  await controllerCall(first.app, c => c.flush());
  await first.app.close();

  const second = await launch({}, userDir);
  await petPage(second.app);
  await second.app.firstWindow();
  await expect.poll(() => second.app.windows().filter(w => w.url().endsWith('/ui/panel.html')).length).toBe(0);
  await second.app.close();
});

test('a dragged position survives a restart', async () => {
  const userDir = mkdtempSync(join(tmpdir(), 'dpet-pos-'));
  const first = await launch({}, userDir);
  await petPage(first.app);
  await controllerCall(first.app, c => { c.settings.pets.testcat.x = 0.25; c.flush(); });
  await first.app.close();

  const second = await launch({}, userDir);
  await petPage(second.app);
  expect(await controllerCall(second.app, c => c.settings.pets.testcat.x)).toBeCloseTo(0.25, 2);
  await second.app.close();
});
