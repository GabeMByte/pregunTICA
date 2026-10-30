import { describe, expect, it } from 'vitest';
import type { Question } from '@preguntica/shared';
import { makeQuestions } from '../engine/test-helpers.js';
import { validateQuestions, type ValidationResult } from './validate.js';

/** Errors of a failed validation (fails the test if it was ok). */
function errorsOf(result: ValidationResult): string[] {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected a failed validation');
  return result.errors;
}

function questionsOf(result: ValidationResult): Question[] {
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(`Expected ok, got: ${result.errors.join('; ')}`);
  return result.questions;
}

/** Five valid questions where question `index` is replaced by `patch` applied over it. */
function withQuestion(index: number, patch: Record<string, unknown>): { questions: unknown[] } {
  const questions: unknown[] = makeQuestions(5);
  questions[index] = { ...(questions[index] as Question), ...patch };
  return { questions };
}

function expectErrorAt(errors: readonly string[], path: string, mentions?: string): void {
  const matching = errors.filter((e) => e.startsWith(path));
  expect(matching, `expected an error starting with "${path}" in ${JSON.stringify(errors)}`).not.toHaveLength(0);
  if (mentions !== undefined) expect(matching.some((e) => e.includes(mentions))).toBe(true);
}

describe('SPEC §6 validation of submit_questions: valid input', () => {
  it('accepts exactly the expected number of valid questions', () => {
    const questions = makeQuestions(5);
    expect(questionsOf(validateQuestions({ questions }, 5))).toEqual(questions);
  });

  it('returns the questions trimmed', () => {
    const input = withQuestion(0, {
      prompt: '  What is it?  ',
      options: [' Alpha ', 'Beta  ', '  Gamma', 'Delta'],
      explanation: ' Because. ',
    });
    const [first] = questionsOf(validateQuestions(input, 5));
    expect(first).toEqual({ prompt: 'What is it?', options: ['Alpha', 'Beta', 'Gamma', 'Delta'], correctIndex: 0, explanation: 'Because.' });
  });

  it('accepts the exact length limits (120 / 60 / 160)', () => {
    const input = withQuestion(1, {
      prompt: 'p'.repeat(120),
      options: ['a'.repeat(60), 'b'.repeat(60), 'c'.repeat(60), 'd'.repeat(60)],
      explanation: 'e'.repeat(160),
    });
    expect(validateQuestions(input, 5).ok).toBe(true);
  });

  it('accepts correctIndex 0 and 3 (the edges)', () => {
    expect(validateQuestions({ questions: makeQuestions(5, [0, 3, 0, 3, 0]) }, 5).ok).toBe(true);
  });
});

describe('SPEC §6 validation of submit_questions: shape errors', () => {
  it.each([
    ['null', null],
    ['a string', 'questions'],
    ['an array', [makeQuestions(5)]],
    ['an object without questions', {}],
    ['questions not being an array', { questions: 'many' }],
  ])('rejects %s with an error on "questions"', (_label, input) => {
    expectErrorAt(errorsOf(validateQuestions(input, 5)), 'questions');
  });

  it('rejects extra keys in a question', () => {
    expectErrorAt(errorsOf(validateQuestions(withQuestion(0, { difficulty: 'easy' }), 5)), 'questions[0]');
  });

  it('every error is a string that starts with the path "questions"', () => {
    const errors = errorsOf(validateQuestions(withQuestion(2, { correctIndex: 9, prompt: '' }), 4));
    for (const error of errors) expect(error.startsWith('questions')).toBe(true);
  });
});

describe('SPEC §6 validation of submit_questions: field limits', () => {
  it('prompt over 120 characters → error at questions[i].prompt mentioning 120', () => {
    expectErrorAt(errorsOf(validateQuestions(withQuestion(0, { prompt: 'p'.repeat(121) }), 5)), 'questions[0].prompt', '120');
  });

  it('empty prompt (only spaces) → error at questions[i].prompt', () => {
    expectErrorAt(errorsOf(validateQuestions(withQuestion(4, { prompt: '   ' }), 5)), 'questions[4].prompt');
  });

  it('option over 60 characters → error at questions[i].options[j] mentioning 60', () => {
    const input = withQuestion(2, { options: ['A', 'x'.repeat(61), 'C', 'D'] });
    expectErrorAt(errorsOf(validateQuestions(input, 5)), 'questions[2].options[1]', '60');
  });

  it('option that is not a string → error at questions[i].options[j]', () => {
    expectErrorAt(errorsOf(validateQuestions(withQuestion(0, { options: ['A', 'B', 3, 'D'] }), 5)), 'questions[0].options[2]');
  });

  it('explanation over 160 characters → error at questions[i].explanation mentioning 160', () => {
    expectErrorAt(errorsOf(validateQuestions(withQuestion(0, { explanation: 'e'.repeat(161) }), 5)), 'questions[0].explanation', '160');
  });

  it.each([4, -1, 1.5])('correctIndex %s → error at questions[i].correctIndex', (correctIndex) => {
    expectErrorAt(errorsOf(validateQuestions(withQuestion(0, { correctIndex }), 5)), 'questions[0].correctIndex');
  });

  it('3 options → error at questions[i].options', () => {
    expectErrorAt(errorsOf(validateQuestions(withQuestion(3, { options: ['A', 'B', 'C'] }), 5)), 'questions[3].options');
  });
});

describe('SPEC §6 validation of submit_questions: extra checks', () => {
  it.each([4, 6])('%s questions when 5 are expected → "questions ... expected exactly 5"', (n) => {
    const errors = errorsOf(validateQuestions({ questions: makeQuestions(n) }, 5));
    expect(errors.some((e) => e.startsWith('questions') && e.includes('expected exactly 5'))).toBe(true);
  });

  it.each([
    ['case and surrounding spaces', ['Paris', ' paris ', 'Rome', 'Lima']],
    ['inner extra spaces', ['San José', 'san  josé', 'Rome', 'Lima']],
    ['NFKC (fullwidth letters)', ['Paris', '\uFF30\uFF41\uFF52\uFF49\uFF53', 'Rome', 'Lima']],
  ])('duplicated options ignoring %s → error at questions[i].options', (_label, options) => {
    expectErrorAt(errorsOf(validateQuestions(withQuestion(1, { options }), 5)), 'questions[1].options');
  });

  it('similar but different options are fine', () => {
    expect(validateQuestions(withQuestion(1, { options: ['Paris', 'Parisa', 'Rome', 'Roma'] }), 5).ok).toBe(true);
  });

  it('duplicated prompt with the same normalization → error at the later questions[j].prompt', () => {
    const questions: unknown[] = makeQuestions(5);
    questions[0] = { ...(questions[0] as Question), prompt: 'What is the capital of France?' };
    questions[3] = { ...(questions[3] as Question), prompt: '  what is the  CAPITAL of france? ' };
    expectErrorAt(errorsOf(validateQuestions({ questions }, 5)), 'questions[3].prompt');
  });

  it('reports every error, not only the first one', () => {
    const questions: unknown[] = makeQuestions(4);
    questions[0] = { ...(questions[0] as Question), prompt: 'p'.repeat(121) };
    questions[2] = { ...(questions[2] as Question), options: ['A', 'x'.repeat(61), 'C', 'D'] };
    const errors = errorsOf(validateQuestions({ questions }, 5));
    expectErrorAt(errors, 'questions[0].prompt');
    expectErrorAt(errors, 'questions[2].options[1]');
    expect(errors.some((e) => e.includes('expected exactly 5'))).toBe(true);
  });
});

describe('security review B6: returned texts are normalized like user text (normalizeText)', () => {
  it('a bidi override inside an option is dropped: "Par\u202Eis" comes back as "Paris"', () => {
    const input = withQuestion(0, { options: ['Par‮is', 'Rome', 'Lima', 'Quito'] });
    const [first] = questionsOf(validateQuestions(input, 5));
    expect(first?.options).toEqual(['Paris', 'Rome', 'Lima', 'Quito']);
  });

  it('the prompt loses zero-width characters and inner double spaces', () => {
    const input = withQuestion(2, { prompt: '  What​ is  the​ capital   of Peru?  ' });
    const questions = questionsOf(validateQuestions(input, 5));
    expect(questions[2]?.prompt).toBe('What is the capital of Peru?');
  });

  it('the explanation is normalized too (NFKC, invisible characters, tabs and newlines)', () => {
    const input = withQuestion(1, { explanation: 'Ｌima​ is\tthe\n capital‮.' });
    const questions = questionsOf(validateQuestions(input, 5));
    expect(questions[1]?.explanation).toBe('Lima is the capital.');
  });

  it('NFKC: a fullwidth option comes back in plain letters', () => {
    const input = withQuestion(0, { options: ['Ｐａｒｉｓ', 'Rome', 'Lima', 'Quito'] });
    const [first] = questionsOf(validateQuestions(input, 5));
    expect(first?.options[0]).toBe('Paris');
  });

  it('normalization keeps correctIndex and the other fields untouched', () => {
    const input = withQuestion(3, { options: ['A​', 'B', 'C', 'D'], correctIndex: 0 });
    const questions = questionsOf(validateQuestions(input, 5));
    expect(questions[3]).toMatchObject({ options: ['A', 'B', 'C', 'D'], correctIndex: 0 });
    expect(questions[0]).toEqual(makeQuestions(5)[0]);
  });

  it('options "Lima" and "Li\u200Bma" are duplicated options at questions[i].options', () => {
    const input = withQuestion(1, { options: ['Lima', 'Li​ma', 'Rome', 'Quito'] });
    expectErrorAt(errorsOf(validateQuestions(input, 5)), 'questions[1].options');
  });

  it('a prompt made only of invisible characters is an error at questions[i].prompt', () => {
    expectErrorAt(errorsOf(validateQuestions(withQuestion(0, { prompt: '​​' }), 5)), 'questions[0].prompt');
  });

  it('an option made only of invisible characters is an error at questions[i].options', () => {
    const input = withQuestion(4, { options: ['A', '​‮', 'C', 'D'] });
    expectErrorAt(errorsOf(validateQuestions(input, 5)), 'questions[4].options');
  });
});
