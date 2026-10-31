// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * SPEC §4 Idioma: every visible text goes through the dictionaries (src/i18n). This fails with
 * file:line for any text written straight into JSX, so a new literal cannot slip in unnoticed.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));

/** Attributes (and props of our own components) a person reads or hears. */
const TEXT_ATTRIBUTES = new Set(['aria-label', 'aria-description', 'aria-valuetext', 'title', 'placeholder', 'alt', 'label', 'legend', 'message']);

/** The brand is the same in every language; the dev catalog is never shipped. */
const ALLOWED_TEXT: Record<string, readonly string[]> = {
  'components/Wordmark.tsx': ['Pregun', 'TICA'],
};
const SKIPPED_FILES = new Set(['routes/ComponentsPage.tsx']);

const HAS_LETTER = /\p{L}/u;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [path] : [];
  });
}

/** The literal text of a string or template, without what goes inside `${…}`. */
function ownText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('');
  return null;
}

/** `a && b`, `a || b`, `a ?? b` can show either side; a comparison like `name !== 'form'` shows nothing. */
const SHOWING_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

/** Strings an expression can show as is: `'a'`, `x ? 'a' : 'b'`, `x && 'a'`, `x ?? 'a'`; not call arguments. */
function shownLiterals(node: ts.Expression): ts.Expression[] {
  if (ts.isParenthesizedExpression(node)) return shownLiterals(node.expression);
  if (ts.isConditionalExpression(node)) return [...shownLiterals(node.whenTrue), ...shownLiterals(node.whenFalse)];
  if (ts.isBinaryExpression(node) && SHOWING_OPERATORS.has(node.operatorToken.kind)) {
    return [...shownLiterals(node.left), ...shownLiterals(node.right)];
  }
  const text = ownText(node);
  return text !== null && HAS_LETTER.test(text) ? [node] : [];
}

function literalTexts(file: string, content = readFileSync(file, 'utf8')): { line: number; text: string }[] {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: { line: number; text: string }[] = [];
  const report = (node: ts.Node, text: string) => {
    found.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, text: text.trim() });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && HAS_LETTER.test(node.text)) report(node, node.text);
    if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText(source)) && node.initializer !== undefined) {
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (value !== undefined) {
        for (const literal of shownLiterals(value)) report(literal, literal.getText(source));
      }
    }
    // {'text'} or {cond ? 'a' : 'b'} as a JSX child.
    const isChild = ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent));
    if (isChild && node.expression !== undefined) {
      for (const literal of shownLiterals(node.expression)) report(literal, literal.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('SPEC §4 Idioma: no literal UI text in JSX', () => {
  it('every visible text in the .tsx files comes from the dictionaries', () => {
    const offenders = sourceFiles(SRC).flatMap((file) => {
      const name = relative(SRC, file).replaceAll('\\', '/');
      if (SKIPPED_FILES.has(name)) return [];
      const allowed = ALLOWED_TEXT[name] ?? [];
      return literalTexts(file)
        .filter(({ text }) => !allowed.includes(text))
        .map(({ line, text }) => `${name}:${String(line)} ${text}`);
    });
    expect(offenders).toEqual([]);
  });

  it('the guard itself catches text, readable attributes and string children, and nothing else', () => {
    const sample = [
      'export const A = () => <p>Hola</p>;',
      'export const B = () => <button aria-label="Cerrar" />;',
      'export const C = () => <button aria-label={`Quedan ${n}`} />;',
      "export const D = () => <span>{'Texto'}</span>;",
      "export const E = () => <p>{done ? 'Listo' : t.wait}</p>;",
      'export const F = () => <StatusScreen message="Espera" />;',
      // Allowed: translated text, punctuation and numbers, attributes nobody reads, call arguments.
      'export const G = () => <p className="big" data-shape="circle">{t.ok} · 3 {t.of(`${n}, ${p}`)} {name !== \'form\' && t.x}</p>;',
    ].join('\n');
    expect(literalTexts('sample.tsx', sample).map(({ line }) => line)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(sourceFiles(SRC).length).toBeGreaterThan(20);
  });
});
