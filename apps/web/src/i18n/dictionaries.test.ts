import { describe, expect, it } from 'vitest';
import { en } from './en.js';
import { es } from './es.js';

type Tree = Record<string, unknown>;

/** Every leaf path, with its value: 'home.tagline' → '…'. */
function leaves(tree: Tree, prefix = ''): [string, unknown][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return typeof value === 'object' && value !== null ? leaves(value as Tree, path) : [[path, value] as [string, unknown]];
  });
}

/** Sample arguments, so functions can be checked to return real text. */
const SAMPLE_ARGS = [3, 'Tica', 7, 'ABC234'];

describe('SPEC §4 Idioma: dictionaries', () => {
  const esLeaves = new Map(leaves(es));
  const enLeaves = new Map(leaves(en));

  it('English has exactly the same keys as Spanish', () => {
    expect([...enLeaves.keys()].sort()).toEqual([...esLeaves.keys()].sort());
  });

  it.each([
    ['es', esLeaves],
    ['en', enLeaves],
  ] as const)('%s: no empty text, and functions return text', (_, entries) => {
    for (const [path, value] of entries) {
      const text = typeof value === 'function' ? (value as (...args: unknown[]) => unknown)(...SAMPLE_ARGS) : value;
      expect(typeof text, path).toBe('string');
      expect((text as string).trim(), path).not.toBe('');
    }
  });

  it('a key is either text in both languages or a function in both, with the same arity', () => {
    for (const [path, value] of esLeaves) {
      const other = enLeaves.get(path);
      expect(typeof other, path).toBe(typeof value);
      if (typeof value === 'function' && typeof other === 'function') expect(other.length, path).toBe(value.length);
    }
  });

  it('the two languages are really translated (not copies)', () => {
    const same = [...esLeaves].filter(([path, value]) => typeof value === 'string' && value === enLeaves.get(path));
    // Short shared words are fine ("ES", "EN", "Quiz"...), whole sentences are not.
    expect(same.filter(([, value]) => (value as string).includes(' '))).toEqual([]);
  });
});
