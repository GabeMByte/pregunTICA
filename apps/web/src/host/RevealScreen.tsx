import type { QuestionRevealPayload, RoomStatePayload } from '@preguntica/shared';
import type { CSSProperties } from 'react';
import { OPTION_LETTERS } from '../components/option-shapes.js';
import { OptionButton } from '../components/OptionButton.js';
import { useT } from '../i18n/useT.js';
import { HostBar } from './HostBar.js';
import { HostButton } from './HostButton.js';
import grid from './OptionGrid.module.css';
import styles from './RevealScreen.module.css';

function VoteBar({ index, votes, total }: { index: number; votes: number; total: number }) {
  const { t } = useT();
  const share = total === 0 ? 0 : votes / total;
  const percent = t.reveal.percent(Math.round(share * 100));
  const letter = OPTION_LETTERS[index] ?? '';
  return (
    <div className={styles.votes} role="img" aria-label={t.option.label(letter, `${t.reveal.votes(votes)}, ${percent}`)}>
      <span className={styles.track} data-option={letter}>
        <span className={styles.fill} style={{ '--share': share } as CSSProperties} />
      </span>
      <span className={styles.count}>
        {votes} · {percent}
      </span>
    </div>
  );
}

export interface RevealScreenProps {
  room: RoomStatePayload;
  reveal: QuestionRevealPayload;
  onNext: () => void;
  disabled: boolean;
}

export function RevealScreen({ room, reveal, onNext, disabled }: RevealScreenProps) {
  const { t } = useT();
  const total = reveal.distribution.reduce((sum, votes) => sum + votes, 0);
  return (
    <main className={styles.page}>
      <HostBar room={room} />
      <h1 className={styles.prompt}>{reveal.prompt}</h1>
      <div className={grid.grid}>
        {reveal.options.map((text, index) => (
          <div key={text} className={styles.option}>
            <OptionButton index={index} text={text} size="projector" state={index === reveal.correctIndex ? 'correct' : 'dimmed'} />
            <VoteBar index={index} votes={reveal.distribution[index] ?? 0} total={total} />
          </div>
        ))}
      </div>
      <div className={styles.footer}>
        <p className={styles.explanation}>
          {total === 0 && <strong>{t.reveal.nobody} </strong>}
          {reveal.explanation}
        </p>
        <HostButton onClick={onNext} disabled={disabled} showShortcut>
          {t.reveal.next}
        </HostButton>
      </div>
    </main>
  );
}
