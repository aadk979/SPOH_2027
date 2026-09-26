import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertStationActive,
  assertStationCountsEntry,
} from '../../src/modules/station/domain/stationRules.js';

/**
 * The station module, as the reference for the layered shape (P06.3): domain
 * rules tested as pure functions, use cases tested against a fake repository.
 */

vi.mock('../../src/modules/station/data/repo.js', () => ({ findStationById: vi.fn() }));

const repo = await import('../../src/modules/station/data/repo.js');
const findStationById = vi.mocked(repo.findStationById);
const { requireActiveStation } =
  await import('../../src/modules/station/application/requireActiveStation.js');
const { requireCountedStation } =
  await import('../../src/modules/station/application/requireCountedStation.js');

type Station = NonNullable<Awaited<ReturnType<typeof repo.findStationById>>>;

function station(overrides: Partial<Station> = {}): Station {
  return {
    id: 'st1',
    code: 'ROOM_A',
    name: 'Room A',
    kind: 'OTHER',
    courseCode: null,
    floor: null,
    countsEntry: true,
    issuesStamp: false,
    active: true,
    sortOrder: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as Station;
}

describe('station rules', () => {
  it.each([
    [{ name: 'Room A', active: true }, null],
    [{ name: 'Room A', active: false }, 'STATION_INACTIVE'],
  ])('assertStationActive(%o) throws %s', (input, code) => {
    const run = (): void => assertStationActive(input);
    if (code) expect(run).toThrow(expect.objectContaining({ code, statusCode: 409 }));
    else expect(run).not.toThrow();
  });

  it.each([
    [{ name: 'Room A', countsEntry: true }, null],
    [{ name: 'Booth', countsEntry: false }, 'STATION_DOES_NOT_COUNT_ENTRY'],
  ])('assertStationCountsEntry(%o) throws %s', (input, code) => {
    const run = (): void => assertStationCountsEntry(input);
    if (code) expect(run).toThrow(expect.objectContaining({ code, statusCode: 409 }));
    else expect(run).not.toThrow();
  });
});

describe('station use cases', () => {
  beforeEach(() => {
    findStationById.mockReset();
  });

  it('requireActiveStation returns an active station', async () => {
    findStationById.mockResolvedValueOnce(station());
    await expect(requireActiveStation('st1')).resolves.toMatchObject({ id: 'st1' });
  });

  it('requireActiveStation refuses a missing station with 404', async () => {
    findStationById.mockResolvedValueOnce(null);
    await expect(requireActiveStation('nope')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('requireActiveStation refuses a closed station', async () => {
    findStationById.mockResolvedValueOnce(station({ active: false }));
    await expect(requireActiveStation('st1')).rejects.toMatchObject({ code: 'STATION_INACTIVE' });
  });

  it('requireCountedStation refuses a room that is not counted', async () => {
    findStationById.mockResolvedValueOnce(station({ countsEntry: false }));
    await expect(requireCountedStation('st1')).rejects.toMatchObject({
      code: 'STATION_DOES_NOT_COUNT_ENTRY',
    });
  });
});
