import { QUESTION_TIME_MS, type QuestionStartPayload } from '@preguntica/shared';
import { useState } from 'react';
import { OptionButton } from '../../components/OptionButton.js';
import { Timer } from '../../components/Timer.js';
import { localDeadline } from '../player-view.js';
import styles from './QuestionScreen.module.css';

export interface QuestionScreenProps {
  question: QuestionStartPayload;
  /** The option already sent for this question. */
  selectedOption: number | null;
  onAnswer: (optionIndex: number) => void;
}

/** Give it a `key` per question: the deadline is read once, when the question arrives. */
export function QuestionScreen({ question, selectedOption, onAnswer }: QuestionScreenProps) {
  const [deadline] = useState(() => localDeadline(question.endsAt, Date.now(), QUESTION_TIME_MS));
  const answered = selectedOption !== null;

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <p className={styles.progress}>
          Pregunta {question.index + 1} de {question.total}
        </p>
        <Timer key={question.index} endsAt={deadline} durationMs={QUESTION_TIME_MS} />
      </header>
      <h1 className={styles.prompt}>{question.prompt}</h1>
      <div className={styles.options}>
        {question.options.map((text, index) => (
          <OptionButton
            key={text}
            index={index}
            text={text}
            state={!answered ? 'idle' : index === selectedOption ? 'selected' : 'dimmed'}
            disabled={answered}
            onSelect={onAnswer}
          />
        ))}
      </div>
      <p className={styles.status} role="status" data-answered={answered}>
        {answered ? 'Respuesta enviada' : 'Elige una respuesta'}
      </p>
    </main>
  );
}
