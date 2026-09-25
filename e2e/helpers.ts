import type { Page } from '@playwright/test';
import type { AppData } from '../src/lib/types';
import { NOW, STORAGE_KEY } from './fixtures';

/** Open the app on the design's day with the given data already saved. */
export async function openWith(page: Page, data: AppData | null, hash = '#/') {
  await page.clock.setFixedTime(new Date(NOW));
  if (data) {
    await page.addInitScript(
      ([key, json]) => {
        // Only on the first load: the app's own saves must survive reloads.
        if (!sessionStorage.getItem('seeded')) {
          localStorage.setItem(key, json);
          sessionStorage.setItem('seeded', '1');
        }
      },
      [STORAGE_KEY, JSON.stringify(data)] as const,
    );
  }
  await page.goto(`./${hash}`);
  await page.locator('main').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}
