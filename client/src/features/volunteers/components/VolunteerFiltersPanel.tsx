import { type ReactNode } from 'react';
import { type CommitteeRole } from '@spoh/shared';

import { Card, Checkbox, Field, Input, Section, Select } from '@/shared/ui';

import { ROLE_LABELS, type VolunteerFilters } from '@/features/volunteers';

import type { VolunteerRoster } from '../hooks/useVolunteerRoster';
export function VolunteerFiltersPanel({ roster }: { roster: VolunteerRoster }): ReactNode {
  const { filters, setFilters, searchInput, setSearchInput } = roster;
  return (
    <Section title="Find someone">
      <Card className="flex flex-col gap-sm sm:flex-row sm:items-end">
        <Field id="q" label="Name or email" className="flex-1">
          {(props) => (
            <Input
              {...props}
              type="search"
              value={searchInput}
              autoCapitalize="off"
              spellCheck={false}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search the roster"
            />
          )}
        </Field>

        <Field id="role" label="Filter by role" className="sm:w-[220px]">
          {(props) => (
            <Select
              {...props}
              value={filters.role}
              onChange={(event) =>
                setFilters({ ...filters, role: event.target.value as CommitteeRole | '' })
              }
            >
              <option value="">Every role</option>
              {ROLE_LABELS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field id="sort" label="Sort by" className="sm:w-[200px]">
          {(props) => (
            <Select
              {...props}
              value={filters.sort}
              onChange={(event) =>
                setFilters({ ...filters, sort: event.target.value as VolunteerFilters['sort'] })
              }
            >
              <option value="name">Name</option>
              <option value="role">Role</option>
              <option value="lastSeen">Never signed in first</option>
              <option value="created">Recently added</option>
            </Select>
          )}
        </Field>

        <Checkbox
          label="Include deactivated"
          checked={filters.active === ''}
          onChange={(event) =>
            setFilters({ ...filters, active: event.target.checked ? '' : 'true' })
          }
          className="sm:h-control"
        />
      </Card>
    </Section>
  );
}
