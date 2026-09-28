import type { Target } from './importTemplates';
/**
 * Minimal CSV parsing.
 *
 * Deliberately not a library: the input is a handful of columns transcribed off
 * a sheet under time pressure, and the failure mode that matters is a
 * mistyped station code, which the server reports row by row. Anything this
 * cannot read is reported rather than guessed at.
 */
export function parseCsv(input: string, target: Target): Array<Record<string, unknown>> {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (lines.length < 2) return [];

  const headers = (lines[0] ?? '').split(',').map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => cell.trim());
    const row: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      const value = cells[index];
      if (value === undefined || value === '') return;

      row[header] = header === 'count' || header === 'quantity' ? Number(value) : value;
    });

    // A registration row without an explicit count is one person.
    if (target === 'registrations' && row.count === undefined) row.count = 1;

    return row;
  });
}
