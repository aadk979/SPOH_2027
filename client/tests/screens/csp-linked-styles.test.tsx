import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { BarRow } from '@/features/dashboard/components/StatTile';
import { Select } from '@/shared/ui/Field';
import { Skeleton } from '@/shared/ui/Feedback';

describe('finite linked styles', () => {
  it.each([[0, 10, 0], [1, 1000, 1], [5, 10, 50], [20, 10, 100], [1, 0, 0], [-1, 10, 0], [Infinity, 10, 0], [1, NaN, 0]])('bounds bar %s/%s without an inline style', (value, max, width) => {
    const { container } = render(<BarRow label="Linked bar" value={value} max={max} />);
    expect(container.querySelector(`.bar-width-${width}`)).not.toBeNull();
    expect(container.querySelector('[style]')).toBeNull();
  });
  it('select and skeleton sizes use linked rules, including every supported bar width', () => {
    const { container } = render(<><Select aria-label="Linked select"><option>One</option></Select><Skeleton size="field" /><Skeleton size="button" /><Skeleton size="title" /><Skeleton /></>);
    expect(container.querySelector('[style]')).toBeNull(); expect(container.querySelector('.spoh-select')).not.toBeNull();
    const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');
    for (const size of ['text', 'field', 'button', 'title']) expect(css).toContain(`.spoh-skeleton-${size}`);
    for (let width = 0; width <= 100; width++) expect(css).toContain(`.bar-width-${width}`);
  });
});
