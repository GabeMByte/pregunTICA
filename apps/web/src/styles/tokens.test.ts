// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Vitest does not process CSS, so the file is read as text.
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css);
  if (match?.[1] === undefined) throw new Error(`Missing color token --${name}`);
  return match[1];
}

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Every text/background pair the components use. AA for normal text is 4.5:1. */
const PAIRS: [text: string, background: string][] = [
  ['color-ink', 'color-night'],
  ['color-ink', 'color-night-raised'],
  ['color-ink-muted', 'color-night'],
  ['color-ink-muted', 'color-night-raised'],
  ['color-coral', 'color-night'],
  ['color-sky', 'color-night'],
  ['color-ink-dark', 'color-ink'],
  ['color-ink-dark', 'color-coral'],
  ['color-ink-dark', 'color-option-a'],
  ['color-ink-dark', 'color-option-b'],
  ['color-ink-dark', 'color-option-c'],
  ['color-ink-dark', 'color-option-d'],
  ['color-ink-dark', 'color-correct'],
  ['color-ink-dark', 'color-wrong'],
];

describe('SPEC §4 Interfaz: high contrast tokens', () => {
  it('computes WCAG contrast correctly (black on white is 21:1)', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it.each(PAIRS)('%s on %s is at least 4.5:1', (text, background) => {
    expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(4.5);
  });

  it('the four option colors are all different', () => {
    const options = ['a', 'b', 'c', 'd'].map((letter) => token(`color-option-${letter}`).toLowerCase());
    expect(new Set(options).size).toBe(4);
  });
});
