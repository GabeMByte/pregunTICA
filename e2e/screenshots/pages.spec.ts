import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';

const OUT_DIR = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));

/** The two targets of SPEC §4 Interfaz: the player's phone and the host's projector. */
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'projector', width: 1920, height: 1080 },
] as const;

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'host', path: '/host' },
  { name: 'play-code', path: '/play/ABC234' },
  { name: 'components', path: '/dev/componentes' },
] as const;

mkdirSync(OUT_DIR, { recursive: true });

for (const viewport of VIEWPORTS) {
  for (const target of PAGES) {
    test(`${target.name} @ ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      // Stills for the presentation: no floating animations mid-frame.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(target.path);
      // The dev catalog is lazy-loaded: wait for real content, not just the load event.
      await page.getByRole('heading').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${OUT_DIR}${target.name}-${viewport.name}.png`, fullPage: true });
    });
  }
}
