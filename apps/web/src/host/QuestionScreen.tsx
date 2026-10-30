import { QUESTION_TIME_MS, type QuestionStartPayload, type RoomStatePayload } from '@preguntica/shared';
import { useState } from 'react';
import { OptionButton } from '../components/OptionButton.js';
import { Timer } from '../components/Timer.js';
import { HostBar } from './HostBar.js';
import { localEndsAt } from './hostView.js';
import grid from './OptionGrid.module.css';
import styles from './QuestionScreen.module.css';

function answeredText(answered: number, expected: number): string {
  return `${String(answered)} de ${String(expected)} ${answered === 1 ? 'respondió' : 'respondieron'}`;
}

/** Mount it with a key per question: the end time is worked out once, when the question arrives. */
export function QuestionScreen({ room, question }: { room: RoomStatePayload; question: QuestionStartPayload }) {
  const [endsAt] = useState(() => localEndsAt(question.endsAt, Date.now()));
  const { answeredCount, expectedAnswers } = room;

  return (
    <main className={styles.page}>
      <HostBar room={room} />
      <div className={styles.head}>
        <h1 className={styles.prompt}>{question.prompt}</h1>
        <Timer key={question.index} endsAt={endsAt} durationMs={QUESTION_TIME_MS} size="projector" />
      </div>
      <div className={grid.grid}>
        {question.options.map((text, index) => (
          <OptionButton key={text} index={index} text={text} size="projector" />
        ))}
      </div>
      {answeredCount !== undefined && expectedAnswers !== undefined && (
        <p className={styles.answered} role="status">
          {answeredText(answeredCount, expectedAnswers)}
        </p>
      )}
    </main>
  );
}
