import { useEffect } from 'react';

const INTERACTIVE = 'a, button, input, select, textarea, summary';

/** Keys on a focused control already activate it; a second trigger here would act twice. */
export function isAdvanceKey(event: KeyboardEvent): boolean {
  if (event.key !== ' ' && event.key !== 'Enter') return false;
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return false;
  if (document.querySelector('dialog[open]') !== null) return false;
  return !(event.target instanceof Element && event.target.closest(INTERACTIVE) !== null);
}

/** Space or Enter move the game forward, so the presenter does not need the mouse. */
export function useAdvanceShortcut(advance: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isAdvanceKey(event)) return;
      event.preventDefault();
      advance();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [advance]);
}
