import { describe, expect, it, vi } from 'vitest';
import type { Question } from '@preguntica/shared';
import { at, deepFreeze, makeQuestions } from '../engine/test-helpers.js';
import { shuffleQuestion, shuffleQuestions } from './shuffle.js';
import { correctText, lcg } from './test-fakes.js';

const QUESTION: Question = {
  prompt: 'Which one is a?',
  options: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
  explanation: 'Because a is a.',
};

describe('SPEC §6 shuffle options on the server (shuffleQuestion)', () => {
  it('Fisher–Yates from the last index: random() = 0 turns [a,b,c,d] into [b,c,d,a]', () => {
    const shuffled = shuffleQuestion(QUESTION, () => 0);
    expect(shuffled.options).toEqual(['b', 'c', 'd', 'a']);
    expect(shuffled.correctIndex).toBe(3);
  });

  it('random() just below 1 swaps every index with itself: order unchanged', () => {
    const shuffled = shuffleQuestion(QUESTION, () => 0.999999);
    expect(shuffled.options).toEqual(['a', 'b', 'c', 'd']);
    expect(shuffled.correctIndex).toBe(0);
  });

  it('draws exactly 3 random numbers per question (i = 3..1)', () => {
    const random = vi.fn(() => 0.5);
    shuffleQuestion(QUESTION, random);
    expect(random).toHaveBeenCalledTimes(3);
  });

  it('correctIndex still points at the same option text', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const question of makeQuestions(4)) {
        const shuffled = shuffleQuestion(question, lcg(seed));
        expect(correctText(shuffled)).toBe(correctText(question));
        expect([...shuffled.options].sort()).toEqual([...question.options].sort());
      }
    }
  });

  it('keeps prompt and explanation intact', () => {
    const shuffled = shuffleQuestion(QUESTION, lcg(3));
    expect(shuffled.prompt).toBe(QUESTION.prompt);
    expect(shuffled.explanation).toBe(QUESTION.explanation);
  });

  it('never mutates the input', () => {
    const input = deepFreeze(structuredClone(QUESTION));
    expect(() => shuffleQuestion(input, () => 0)).not.toThrow();
    expect(input).toEqual(QUESTION);
  });

  it('across seeds the correct answer lands in all 4 positions', () => {
    const positions = new Set<number>();
    // Spread seeds: Park–Miller's first value for small seeds is ~0, which would always pick j = 0.
    for (let seed = 1; seed <= 100; seed++) positions.add(shuffleQuestion(QUESTION, lcg(seed * 104_729)).correctIndex);
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('SPEC §6 shuffle every question (shuffleQuestions)', () => {
  it('keeps the order of the questions and shuffles each one', () => {
    const questions = makeQuestions(3);
    const shuffled = shuffleQuestions(questions, () => 0);
    expect(shuffled.map((q) => q.prompt)).toEqual(questions.map((q) => q.prompt));
    shuffled.forEach((q, i) => {
      const original = at(questions, i);
      expect(q.options).toEqual([1, 2, 3, 0].map((k) => at(original.options, k)));
      expect(correctText(q)).toBe(correctText(original));
    });
  });

  it('consumes the random source question by question, like shuffleQuestion in sequence', () => {
    const questions = makeQuestions(5);
    const sequential = lcg(42);
    const expected = questions.map((q) => shuffleQuestion(q, sequential));
    expect(shuffleQuestions(questions, lcg(42))).toEqual(expected);
  });

  it('never mutates the input list', () => {
    const questions = makeQuestions(4);
    const input = deepFreeze(structuredClone(questions));
    expect(() => shuffleQuestions(input, lcg(1))).not.toThrow();
    expect(input).toEqual(questions);
  });

  it('an empty list gives an empty list', () => {
    expect(shuffleQuestions([], () => 0)).toEqual([]);
  });
});
