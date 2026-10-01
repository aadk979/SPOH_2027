import type { ReactNode } from 'react';
import { CommitteeRole } from '@spoh/shared';
import { Checkbox } from '@/shared/ui';

export function ReaderRoles({
  value,
  onChange,
  disabled,
}: {
  value: CommitteeRole[];
  onChange(value: CommitteeRole[]): void;
  disabled: boolean;
}): ReactNode {
  return (
    <fieldset className="flex flex-col gap-xs">
      <legend className="text-body font-semibold">Roles that may read this field</legend>
      <div className="grid grid-cols-2 gap-x-md">
        {CommitteeRole.options.map((role) => (
          <Checkbox
            key={role}
            label={role.replaceAll('_', ' ')}
            checked={value.includes(role)}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...value, role]
                  : value.filter((selected) => selected !== role),
              )
            }
          />
        ))}
      </div>
    </fieldset>
  );
}
