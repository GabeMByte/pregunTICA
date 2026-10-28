import { describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET } from './constants.js';
import { QuestionSchema } from './domain.js';

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
