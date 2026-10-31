import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OptionButton } from './OptionButton.js';
import { InLocale } from '../i18n/InLocale.js';

afterEach(cleanup);

describe('SPEC §4 Interfaz: OptionButton', () => {
  it.each([
    [0, 'A', 'triangle'],
    [1, 'B', 'diamond'],
    [2, 'C', 'circle'],
    [3, 'D', 'square'],
  ] as const)('option %i is %s with a %s (never color alone)', (index, letter, shape) => {
    const { container } = render(<OptionButton index={index} text="París" onSelect={vi.fn()} />);
    const button = screen.getByRole('button', { name: `Opción ${letter}: París` });
    expect(button.textContent).toContain(letter);
    expect(container.querySelector(`svg[data-shape="${shape}"]`)).not.toBeNull();
  });

  it('calls onSelect with its index', () => {
    const onSelect = vi.fn();
    render(<OptionButton index={2} text="Lima" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('a disabled option cannot be chosen', () => {
    const onSelect = vi.fn();
    render(<OptionButton index={0} text="Lima" onSelect={onSelect} disabled />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('the selected option is pressed and says so', () => {
    render(<OptionButton index={1} text="Lima" state="selected" onSelect={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Opción B: Lima (Tu respuesta)' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it.each([
    ['correct', 'Correcta'],
    ['wrong', 'Incorrecta'],
  ] as const)('after REVEAL a %s option says "%s" in text, not only in color', (state, label) => {
    render(<OptionButton index={0} text="Lima" state={state} />);
    expect(screen.getByText(label)).toBeDefined();
  });

  it('without onSelect (projector) it is not a button', () => {
    render(<OptionButton index={3} text="Quito" size="projector" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('group', { name: 'Opción D: Quito' })).toBeDefined();
  });

  it('rejects an index outside 0–3', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<OptionButton index={4} text="x" />)).toThrow(/out of range/);
  });
});

describe('SPEC §4 Idioma: OptionButton in English', () => {
  it('names the option and its state in English', () => {
    render(
      <InLocale locale="en">
        <OptionButton index={1} text="Lima" state="correct" />
      </InLocale>,
    );
    expect(screen.getByRole('group', { name: 'Option B: Lima (Correct)' })).toBeDefined();
    expect(screen.getByText('Correct')).toBeDefined();
  });
});
