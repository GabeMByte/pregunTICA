import { OPTION_LETTERS, OPTION_SHAPES } from './option-shapes.js';
import { OptionShape } from './OptionShape.js';
import styles from './OptionButton.module.css';

/** idle: can be chosen; selected: the player's pick; correct/wrong: after REVEAL; dimmed: not relevant any more. */
export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'dimmed';

const STATE_LABELS: Partial<Record<OptionState, string>> = {
  selected: 'Tu respuesta',
  correct: 'Correcta',
  wrong: 'Incorrecta',
};

export interface OptionButtonProps {
  /** 0–3: picks the color, shape and letter (SPEC §4 Interfaz). */
  index: number;
  text: string;
  state?: OptionState;
  /** Without it the option is shown, not chosen (the host's projector). */
  onSelect?: (index: number) => void;
  disabled?: boolean;
  size?: 'phone' | 'projector';
}

export function OptionButton({ index, text, state = 'idle', onSelect, disabled = false, size = 'phone' }: OptionButtonProps) {
  const shape = OPTION_SHAPES[index];
  const letter = OPTION_LETTERS[index];
  if (shape === undefined || letter === undefined) throw new Error(`Option index out of range: ${String(index)}`);

  const stateLabel = STATE_LABELS[state];
  const className = [styles.option, styles[shape], styles[state], styles[size]].join(' ');
  const content = (
    <>
      <span className={styles.badge}>
        <OptionShape shape={shape} className={styles.shape} />
        <span className={styles.letter}>{letter}</span>
      </span>
      <span className={styles.text}>{text}</span>
      {stateLabel !== undefined && <span className={styles.status}>{stateLabel}</span>}
    </>
  );
  const label = `Opción ${letter}: ${text}${stateLabel === undefined ? '' : ` (${stateLabel})`}`;

  if (onSelect === undefined) {
    return (
      <div className={className} data-state={state} aria-label={label} role="group">
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={className}
      data-state={state}
      aria-label={label}
      aria-pressed={state === 'selected'}
      disabled={disabled}
      onClick={() => {
        onSelect(index);
      }}
    >
      {content}
    </button>
  );
}
