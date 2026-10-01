import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeadlineTile } from '@/features/dashboard';

/** The headline figure (ADR-002 §4): above the counts, labelled, never a sum. */
describe('the headline tile', () => {
  it('shows nothing in separate mode', () => {
    const { container } = render(<HeadlineTile headline={null} />);
    expect(container.textContent).toBe('');
  });

  it('says where the figure comes from, and that it is not a sum', () => {
    render(
      <HeadlineTile
        headline={{
          source: { count: 'registrations' },
          sourceLabel: 'from registrations',
          value: 1234,
        }}
      />,
    );
    expect(screen.getByText('Visitors')).toBeTruthy();
    expect(screen.getByText(/from registrations/)).toBeTruthy();
    expect(screen.getByText(/not their sum/)).toBeTruthy();
  });
});
