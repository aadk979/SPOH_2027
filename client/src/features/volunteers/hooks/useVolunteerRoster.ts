import { useEffect, useState } from 'react';

import { useVolunteers, type VolunteerFilters } from '@/features/volunteers';

export function useVolunteerRoster() {
  const [filters, setFilters] = useState<VolunteerFilters>({
    q: '',
    role: '',
    active: 'true',
    sort: 'name',
  });
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.q === searchInput ? prev : { ...prev, q: searchInput }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const volunteers = useVolunteers(filters);
  const [editing, setEditing] = useState<string | null>(null);

  return { filters, setFilters, searchInput, setSearchInput, volunteers, editing, setEditing };
}
export type VolunteerRoster = ReturnType<typeof useVolunteerRoster>;
