import { test, expect } from '@playwright/test';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { controllerCall, launch, panelPage, petPage } from './helpers';

test('the panel lists the problems logged, and one click puts a report of them in Downloads', async () => {
  const downloads = mkdtempSync(join(tmpdir(), 'dpet-downloads-'));
  const { app } = await launch({ DESKTOP_PET_DOWNLOADS: downloads });
  await petPage(app);
  await controllerCall(app, c => { c.openPanel(); });
  const panel = await panelPage(app);
  await panel.locator('.tab[data-tab="problems"]').click();
  await expect(panel.locator('.no-problems')).toBeVisible();
  // a problem comes while the panel is open; the menu and the memo are the owner's own: never in the report
  await controllerCall(app, c => {
    c.log.warn('測試用的警告');
    c.log.info('轉盤：轉到 水餃');
    c.cards.notes.memo = '只有我知道的備忘';
  });
  await expect(panel.locator('.problems li').first()).toContainText('測試用的警告');
  await panel.locator('button.report').click();
  await expect(panel.locator('.report-saved')).toContainText('打工貓貓-問題報告-');
  const files = readdirSync(downloads);
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/^打工貓貓-問題報告-\d{4}-\d{2}-\d{2}-\d{4}\.md$/);
  const md = readFileSync(join(downloads, files[0]), 'utf8');
  for (const s of ['# 打工貓貓問題報告', '## 基本資料', '## 貓咪', '測試貓', '## 程序與記憶體', '## GPU', '## 問題', '測試用的警告', '## 最近的紀錄', '轉盤：轉到 （菜名略）'])
    expect(md).toContain(s);
  expect(md).not.toContain('水餃');
  expect(md).not.toContain('只有我知道的備忘');
  await app.close();
});
