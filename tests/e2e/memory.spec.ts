import { test, expect } from '@playwright/test';
import { controllerCall, launch, petPage } from './helpers';

const loadedClips = () => [...document.querySelectorAll('video')]
  .filter(v => v.getAttribute('src')).map(v => v.getAttribute('src')!.split('/').pop());

test('clips the cat can no longer reach are released, and load again when needed', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  const history = () => page.evaluate(() => (window as any).__pet.history.join(','));
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
  await controllerCall(app, c => c.pets.get('testcat').send('pet:command', 'sit'));
  await expect.poll(history, { timeout: 15_000 }).toMatch(/rest_to_sit,idle_sit/);
  await controllerCall(app, c => c.pets.get('testcat').send('pet:command', 'rest'));
  // resting, the cat can only play its idles, go to sit or go to the perch next: idle_sit is not needed
  await expect.poll(() => page.evaluate(loadedClips), { timeout: 15_000 }).not.toContain('idle_sit.webm');

  const n = await page.evaluate(() => (window as any).__pet.history.length);
  await controllerCall(app, c => c.pets.get('testcat').send('pet:command', 'sit'));
  await expect.poll(() => page.evaluate(k => (window as any).__pet.history.slice(k).join(','), n), { timeout: 15_000 }).toMatch(/rest_to_sit,idle_sit/);
  await expect.poll(() => page.evaluate(() => {
    const p = (window as any).__pet.player;
    return p.step.clip === 'idle_sit' && p.video.readyState >= 2 && p.video.currentTime > 0.1;
  })).toBe(true);
  await app.close();
});
