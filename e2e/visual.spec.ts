import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { sampleData } from './fixtures';
import { openWith } from './helpers';

/**
 * The app next to the design mockup (design/Design.html), on the design's own
 * data, at the design's size. Each comparison writes mockup | app | diff to
 * test-results/visual/ for a look, and fails when the share of differing
 * pixels grows past what the known, intended differences explain (listed per
 * screen).
 */

const OUT = resolve('test-results/visual');
const DESIGN = `file://${resolve('design/Design.html')}`;

interface Board {
  title: string;
  hash: string;
  height?: number;
  /** Largest share of differing pixels accepted. */
  max: number;
  /** Known differences from the mockup, on purpose. */
  why: string;
  prepare?: (page: Page) => Promise<void>;
}

const BOARDS: Board[] = [
  { title: 'Today board', hash: '#/', max: 0.02, why: 'Settings button in the bottom bar; Wednesday is 4/5 (the mockup data disagrees with itself)' },
  {
    title: 'Hold a tile',
    hash: '#/',
    max: 0.06,
    why: 'the real board shows behind the sheet (the mockup draws placeholder squares)',
    prepare: async (page) => {
      await page.getByRole('button', { name: /^Workout/ }).click({ button: 'right' });
      await page.getByLabel('Note for today').fill('Legs and core, 45 min');
      await page.getByRole('button', { name: 'Save' }).focus();
    },
  },
  {
    title: 'Week',
    hash: '#/week',
    height: 980,
    max: 0.11,
    why: 'each row is 3px taller for 44px tap targets, which adds up down the page; Settings button; Water on Wednesday is done in this data',
  },
  { title: 'Habit history', hash: '#/habit/read00000001', max: 0.035, why: 'no reminders ("Evening" instead of "reminder 21:30"); best streak is computed' },
  {
    title: 'New habit in one sentence',
    hash: '#/new?text=Read%2020%20min%20every%20evening',
    max: 0.05,
    why: '"Icon" instead of "Reminder"; five colors; icon picked from the name',
  },
];

async function mockupShot(page: Page, title: string): Promise<Buffer> {
  await page.setViewportSize({ width: 1200, height: 5600 });
  await page.goto(DESIGN);
  const frame = page.locator(`iframe[title="${title}"]`);
  await expect(frame).toBeVisible({ timeout: 20_000 });
  // The bundle unpacks, then each board renders its fonts.
  await expect(frame.contentFrame().locator('main, section').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  return frame.screenshot();
}

for (const board of BOARDS) {
  test(`looks like the mockup: ${board.title}`, async ({ browser }) => {
    const mockPage = await browser.newPage({ deviceScaleFactor: 1 });
    const mock = PNG.sync.read(await mockupShot(mockPage, board.title));
    await mockPage.close();

    const context = await browser.newContext({
      viewport: { width: mock.width, height: board.height ?? mock.height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      timezoneId: 'Europe/Berlin',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await openWith(page, sampleData(), board.hash);
    await board.prepare?.(page);
    const app = PNG.sync.read(await page.screenshot());
    await context.close();

    // The mockup's frames can come out a pixel taller than asked; compare what both have.
    const width = Math.min(mock.width, app.width);
    const height = Math.min(mock.height, app.height);
    const crop = (img: PNG) => {
      const out = new PNG({ width, height });
      PNG.bitblt(img, out, 0, 0, width, height, 0, 0);
      return out;
    };
    const [a, b] = [crop(mock), crop(app)];
    const diff = new PNG({ width, height });
    const differing = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.15 });
    const share = differing / (width * height);

    mkdirSync(OUT, { recursive: true });
    const side = new PNG({ width: width * 3 + 20, height });
    side.data.fill(255);
    PNG.bitblt(a, side, 0, 0, width, height, 0, 0);
    PNG.bitblt(b, side, 0, 0, width, height, width + 10, 0);
    PNG.bitblt(diff, side, 0, 0, width, height, width * 2 + 20, 0);
    const name = board.title.toLowerCase().replace(/\W+/g, '-');
    writeFileSync(`${OUT}/${name}.png`, PNG.sync.write(side));
    test.info().annotations.push({ type: 'differing pixels', description: `${(share * 100).toFixed(2)}% (${board.why})` });

    expect(share, `share of pixels that differ from the mockup (${board.why})`).toBeLessThan(board.max);
  });
}
