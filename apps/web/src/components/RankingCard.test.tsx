import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RankingCard } from './RankingCard.js';
import { InLocale } from '../i18n/InLocale.js';

afterEach(cleanup);

function renderCard(props: Parameters<typeof RankingCard>[0]) {
  return render(
    <ol>
      <RankingCard {...props} />
    </ol>,
  );
}

describe('SPEC §4 Interfaz: RankingCard', () => {
  it('shows rank, nickname and score in es-CR format', () => {
    renderCard({ rank: 2, nickname: 'Tica', score: 12_345 });
    expect(screen.getByLabelText('Puesto 2').textContent).toBe('2');
    expect(screen.getByText('Tica')).toBeDefined();
    // es-CR groups thousands with a no-break space.
    expect(screen.getByText(/^12\s345$/)).toBeDefined();
  });

  it('shows the points won in the last question', () => {
    renderCard({ rank: 1, nickname: 'Tica', score: 900, delta: 900 });
    expect(screen.getByText('+900')).toBeDefined();
  });

  it('hides the delta when the player won nothing', () => {
    renderCard({ rank: 4, nickname: 'Tica', score: 900, delta: 0 });
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it('marks the player own row', () => {
    renderCard({ rank: 5, nickname: 'Yo', score: 10, highlight: true });
    expect(screen.getByRole('listitem').getAttribute('aria-current')).toBe('true');
  });

  it('other rows are not marked', () => {
    renderCard({ rank: 5, nickname: 'Otro', score: 10 });
    expect(screen.getByRole('listitem').hasAttribute('aria-current')).toBe(false);
  });
});

describe('SPEC §4 Idioma: RankingCard in English', () => {
  it('groups thousands with a comma and reads the place in English', () => {
    render(
      <InLocale locale="en">
        <ol>
          <RankingCard rank={2} nickname="Tica" score={12_345} delta={1_200} />
        </ol>
      </InLocale>,
    );
    expect(screen.getByText('12,345')).toBeDefined();
    expect(screen.getByText('+1,200')).toBeDefined();
    expect(screen.getByLabelText('Place 2').textContent).toBe('2');
  });
});
