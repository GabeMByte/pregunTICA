import type { LeaderboardEntry, RoomStatePayload } from '@preguntica/shared';
import { useLayoutEffect, useRef } from 'react';
import { RankingCard } from '../components/RankingCard.js';
import { HostBar } from './HostBar.js';
import { HostButton } from './HostButton.js';
import { rankShifts } from './hostView.js';
import styles from './LeaderboardScreen.module.css';

export interface LeaderboardScreenProps {
  room: RoomStatePayload;
  entries: LeaderboardEntry[];
  onNext: () => void;
  disabled: boolean;
}

export function LeaderboardScreen({ room, entries, onNext, disabled }: LeaderboardScreenProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const isLast = room.questionIndex !== null && room.questionIndex + 1 >= room.totalQuestions;

  // RankingCard owns its <li>, so the offset the CSS animation starts from is set on the element.
  useLayoutEffect(() => {
    const shifts = rankShifts(entries);
    [...(listRef.current?.children ?? [])].forEach((item, index) => {
      if (item instanceof HTMLElement) item.style.setProperty('--from', String(shifts[index] ?? 0));
    });
  }, [entries]);

  return (
    <main className={styles.page}>
      <HostBar room={room} />
      <h1 className={styles.title}>Ranking</h1>
      {entries.length === 0 ? (
        <p className={styles.empty}>Todavía no hay jugadores en el ranking.</p>
      ) : (
        <ol ref={listRef} className={styles.list}>
          {entries.map((entry, index) => (
            <RankingCard key={entry.nickname} rank={index + 1} size="projector" {...entry} />
          ))}
        </ol>
      )}
      <div className={styles.footer}>
        <HostButton onClick={onNext} disabled={disabled} showShortcut>
          {isLast ? 'Ver podio' : 'Siguiente pregunta'}
        </HostButton>
      </div>
    </main>
  );
}
