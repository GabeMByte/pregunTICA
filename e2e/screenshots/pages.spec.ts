import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';

const SHOTS = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));

/** Spanish keeps the paths it always had; English goes in its own folder (SPEC §4 Idioma). */
const LOCALES = [
  { locale: 'es-CR', dir: SHOTS },
  { locale: 'en-US', dir: `${SHOTS}en/` },
] as const;

/** The two targets of SPEC §4 Interfaz: the player's phone and the host's projector. */
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'projector', width: 1920, height: 1080 },
] as const;

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'host', path: '/host' },
  { name: 'play-code', path: '/play/ABC234' },
  // The dev catalog is not translated: Spanish only.
  { name: 'components', path: '/dev/componentes', spanishOnly: true },
] as const;

for (const { locale, dir } of LOCALES) {
  mkdirSync(dir, { recursive: true });

  test.describe(locale, () => {
    test.use({ locale });

    for (const viewport of VIEWPORTS) {
      for (const target of PAGES) {
        if ('spanishOnly' in target && locale !== 'es-CR') continue;

        test(`${target.name} @ ${viewport.name}`, async ({ page }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          // Stills for the presentation: no floating animations mid-frame.
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await page.goto(target.path);
          // The dev catalog is lazy-loaded: wait for real content, not just the load event.
          await page.getByRole('heading').first().waitFor();
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: `${dir}${target.name}-${viewport.name}.png`, fullPage: true });
        });
      }
    }
  });
}
