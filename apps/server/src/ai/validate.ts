import { z } from 'zod';
import { QuestionSchema, normalizeText, type Question } from '@preguntica/shared';

export type ValidationResult = { ok: true; questions: Question[] } | { ok: false; errors: string[] };

/** Strict: a question with extra keys is an error the model should hear about. */
const SubmitInputSchema = z.object({ questions: z.array(z.strictObject(QuestionSchema.shape)) });

/** Case, spacing and NFKC differences do not make two texts different. */
const comparable = (text: string): string => normalizeText(text).toLowerCase();

/**
 * Validates the input of the submit_questions tool: `{ questions: Question[] }`.
 * SPEC §6: QuestionSchema plus exact count, options unique ignoring case/spaces/NFKC, and no
 * duplicated prompts (same normalization). Errors are concrete English strings for the model,
 * each starting with the path, e.g. "questions[2].options[1]: ..." or "questions: expected exactly 5".
 * On success returns the parsed (trimmed) questions.
 */
export function validateQuestions(input: unknown, expectedCount: number): ValidationResult {
  const errors: string[] = [];
  // Checked before the schema so the model hears about every problem in one retry.
  const raw: unknown = typeof input === 'object' && input !== null && 'questions' in input ? input.questions : undefined;
  if (Array.isArray(raw) && raw.length !== expectedCount) {
    errors.push(`questions: expected exactly ${String(expectedCount)} questions, got ${String(raw.length)}`);
  }

  const parsed = SubmitInputSchema.safeParse(normalizeTexts(input));
  if (!parsed.success) return { ok: false, errors: [...errors, ...parsed.error.issues.map(describeIssue)] };

  const { questions } = parsed.data;

  const firstWithPrompt = new Map<string, number>();
  questions.forEach((question, i) => {
    const options = question.options.map(comparable);
    if (new Set(options).size !== options.length) {
      errors.push(`questions[${String(i)}].options: the 4 options must be different (ignoring case and spaces)`);
    }
    const prompt = comparable(question.prompt);
    const first = firstWithPrompt.get(prompt);
    if (first === undefined) firstWithPrompt.set(prompt, i);
    else errors.push(`questions[${String(i)}].prompt: duplicates questions[${String(first)}].prompt`);
  });

  return errors.length === 0 ? { ok: true, questions } : { ok: false, errors };
}

/**
 * Security review B6: the model's texts get the same cleanup as player input (NFKC, no invisible,
 * bidi or control characters, collapsed spaces) before the limits apply. Anything that is not the
 * expected shape is left as is, so the schema still reports it.
 */
function normalizeTexts(input: unknown): unknown {
  if (!isRecord(input) || !Array.isArray(input.questions)) return input;
  const questions: unknown[] = input.questions.map((question: unknown) => {
    if (!isRecord(question)) return question;
    const copy: Record<string, unknown> = { ...question };
    for (const key of ['prompt', 'explanation']) if (typeof copy[key] === 'string') copy[key] = normalizeText(copy[key]);
    if (Array.isArray(copy.options)) copy.options = copy.options.map((option: unknown) => (typeof option === 'string' ? normalizeText(option) : option));
    return copy;
  });
  return { ...input, questions };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** "questions[2].options[1]: Too big: expected string to have <=60 characters". */
function describeIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.reduce<string>(
    (acc, key) => (typeof key === 'number' ? `${acc}[${String(key)}]` : acc === '' ? String(key) : `${acc}.${String(key)}`),
    '',
  );
  // Issues at the root (input is not an object) are still about "questions".
  const where = path.startsWith('questions') ? path : path === '' ? 'questions' : `questions.${path}`;
  return `${where}: ${issue.message}`;
}
