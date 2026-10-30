import type { Question } from '@preguntica/shared';

/**
 * SPEC §6: shuffles the options server-side (models bias the correct position).
 * Fisher–Yates from the last index down: for i = 3..1, j = floor(random() * (i + 1)), swap(i, j).
 * correctIndex is recomputed so it points at the same option text. Never mutates the input.
 */
export function shuffleQuestion(question: Question, random: () => number): Question {
  // Shuffle positions, not texts, so correctIndex follows the right option.
  const order = question.options.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j] ?? j, order[i] ?? i];
  }
  return {
    ...question,
    options: order.map((index) => question.options[index] ?? ''),
    correctIndex: order.indexOf(question.correctIndex),
  };
}

/** Shuffles the options of every question (the order of the questions is kept). */
export function shuffleQuestions(questions: readonly Question[], random: () => number): Question[] {
  return questions.map((question) => shuffleQuestion(question, random));
}
