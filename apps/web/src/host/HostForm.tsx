import {
  HostCreatePayloadSchema,
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  TOPIC_MAX_LENGTH,
  TOPIC_MIN_LENGTH,
  type Difficulty,
  type Language,
} from '@preguntica/shared';
import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { Wordmark } from '../components/Wordmark.js';
import { HostButton } from './HostButton.js';
import styles from './HostForm.module.css';
import type { FormDraft } from './hostView.js';
import type { CreateRoomInput } from './useHostGame.js';

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'Fácil' },
  { value: 'medium', label: 'Media' },
  { value: 'hard', label: 'Difícil' },
];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
];

const TOPIC_ERROR = `Escribe un tema de ${String(TOPIC_MIN_LENGTH)} a ${String(TOPIC_MAX_LENGTH)} caracteres.`;

interface ChoiceProps<T extends string> {
  legend: string;
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

function Choice<T extends string>({ legend, name, options, value, onChange }: ChoiceProps<T>) {
  return (
    <fieldset className={styles.choice}>
      <legend className={styles.label}>{legend}</legend>
      <div className={styles.segments}>
        {options.map((option) => (
          <label key={option.value} className={styles.segment}>
            <input
              type="radio"
              name={name}
              checked={option.value === value}
              onChange={() => {
                onChange(option.value);
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export interface HostFormProps {
  draft: FormDraft;
  onDraftChange: (draft: FormDraft) => void;
  onCreate: (input: CreateRoomInput) => void;
  connected: boolean;
  creating: boolean;
  /** Why the server refused the last attempt. */
  error: string | null;
}

export function HostForm({ draft, onDraftChange, onCreate, connected, creating, error }: HostFormProps) {
  const [topicInvalid, setTopicInvalid] = useState(false);
  const shownError = topicInvalid ? TOPIC_ERROR : error;

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    const parsed = HostCreatePayloadSchema.safeParse(draft);
    setTopicInvalid(!parsed.success);
    if (parsed.success) onCreate(parsed.data);
  };

  return (
    <main className={styles.page}>
      <Link to="/" className={styles.brand} aria-label="Volver al inicio">
        <Wordmark size="m" />
      </Link>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.heading}>
          <h1 className={styles.title}>Nueva partida</h1>
          <p className={styles.lead}>Crea una sala y elige un tema.</p>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Tema</span>
          <input
            className={styles.topic}
            type="text"
            value={draft.topic}
            maxLength={TOPIC_MAX_LENGTH}
            placeholder="Volcanes de Costa Rica"
            autoComplete="off"
            aria-invalid={topicInvalid}
            onChange={(event) => {
              setTopicInvalid(false);
              onDraftChange({ ...draft, topic: event.target.value });
            }}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            Preguntas: <output className={styles.count}>{draft.count}</output>
          </span>
          <input
            className={styles.range}
            type="range"
            min={MIN_QUESTIONS}
            max={MAX_QUESTIONS}
            value={draft.count}
            onChange={(event) => {
              onDraftChange({ ...draft, count: Number(event.target.value) });
            }}
          />
        </label>

        <div className={styles.choices}>
          <Choice
            legend="Dificultad"
            name="difficulty"
            options={DIFFICULTIES}
            value={draft.difficulty}
            onChange={(difficulty) => {
              onDraftChange({ ...draft, difficulty });
            }}
          />
          <Choice
            legend="Idioma de las preguntas"
            name="language"
            options={LANGUAGES}
            value={draft.language}
            onChange={(language) => {
              onDraftChange({ ...draft, language });
            }}
          />
        </div>

        {shownError !== null && (
          <p className={styles.error} role="alert">
            {shownError}
          </p>
        )}

        <HostButton type="submit" disabled={!connected || creating}>
          {connected ? (creating ? 'Creando…' : 'Crear sala') : 'Conectando…'}
        </HostButton>
      </form>
    </main>
  );
}
