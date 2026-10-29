import { describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET } from './constants.js';
import { NicknameSchema, QuestionSchema } from './domain.js';

const question = {
  prompt: '¿Cuál es el volcán más alto de Costa Rica?',
  options: ['Irazú', 'Poás', 'Arenal', 'Turrialba'],
  correctIndex: 0,
  explanation: 'El Irazú alcanza 3432 m sobre el nivel del mar.',
};

describe('QuestionSchema', () => {
  it('accepts a valid question', () => {
    expect(QuestionSchema.safeParse(question).success).toBe(true);
  });

  it('enforces the length limits from the spec', () => {
    expect(QuestionSchema.safeParse({ ...question, prompt: 'x'.repeat(121) }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...question, explanation: 'x'.repeat(161) }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...question, options: ['x'.repeat(61), 'B', 'C', 'D'] }).success).toBe(false);
  });

  it('requires exactly 4 unique options', () => {
    expect(QuestionSchema.safeParse({ ...question, options: ['A', 'B', 'C'] }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...question, options: ['A', 'B', 'C', 'D', 'E'] }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...question, options: ['A', 'B', 'C', 'A'] }).success).toBe(false);
  });

  it.each([-1, 4])('rejects correctIndex %s', (correctIndex) => {
    expect(QuestionSchema.safeParse({ ...question, correctIndex }).success).toBe(false);
  });
});

describe('ROOM_CODE_ALPHABET', () => {
  it('has no look-alike characters', () => {
    for (const ch of '0O1IL') expect(ROOM_CODE_ALPHABET).not.toContain(ch);
  });
});

describe('NicknameSchema (security review B5)', () => {
  const parse = (raw: string) => NicknameSchema.safeParse(raw);
  const value = (raw: string) => {
    const result = parse(raw);
    if (!result.success) throw new Error(`rejected: ${JSON.stringify(raw)}`);
    return result.data;
  };

  it('keeps normal nicknames, accents and ñ', () => {
    expect(value('Ana')).toBe('Ana');
    expect(value('José Ñandú')).toBe('José Ñandú');
  });

  it('normalizes with NFKC so equivalent spellings compare equal', () => {
    expect(value('Jose\u0301')).toBe('José'); // combining accent → precomposed
    expect(value('\uFF21\uFF4E\uFF41')).toBe('Ana'); // fullwidth letters
  });

  it('removes invisible and control characters', () => {
    expect(value('A\u200Bna')).toBe('Ana'); // zero-width space
    expect(value('\u202EAna')).toBe('Ana'); // right-to-left override
    expect(value('An\u0000a\u0007')).toBe('Ana'); // control characters
    expect(value('\uFEFFAna\u2060')).toBe('Ana'); // BOM and word joiner
  });

  it('collapses runs of whitespace into one space and trims', () => {
    expect(value('  Ana \t\n  María  ')).toBe('Ana María');
    expect(value('Ana\u00A0\u3000María')).toBe('Ana María');
  });

  it('rejects a nickname that is empty once invisible characters are removed', () => {
    expect(parse('\u200B\u200B').success).toBe(false);
    expect(parse(' \u202E ').success).toBe(false);
  });

  it('applies the length limit after normalization', () => {
    expect(value(`${'a'.repeat(16)}\u200B`)).toHaveLength(16);
    expect(parse('a'.repeat(17)).success).toBe(false);
  });

  it('does not try to detect homoglyphs across scripts (accepted: Cyrillic А stays as is)', () => {
    expect(value('\u0410na')).toBe('\u0410na');
  });
});
