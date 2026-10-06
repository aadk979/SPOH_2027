import { Button } from '@/shared/ui';
import { CategoryScheduleAccessNotice } from './CategoryScheduleAccessNotice';
import { CategoryScheduleWorkspace } from './CategoryScheduleWorkspace';

export function CategorySchedulePanelBody(input: {
  ownerKey: string;
  open: boolean;
  locked: boolean;
  available: boolean;
  timezone: string;
  onToggle: () => void;
  onLockChange: (locked: boolean) => void;
  onDenied: () => void;
}) {
  return (
    <section
      id="category-schedules"
      className="flex flex-col gap-md"
      aria-label="Category schedules"
    >
      <Button
        variant="secondary"
        aria-expanded={input.open}
        disabled={input.locked || !input.available}
        onClick={input.onToggle}
      >
        Category schedules
      </Button>
      {!input.available ? <CategoryScheduleAccessNotice /> : null}
      {input.open ? (
        <div hidden={!input.available} inert={!input.available}>
          <CategoryScheduleWorkspace
            key={input.ownerKey}
            timezone={input.timezone}
            accessAvailable={input.available}
            onLockChange={input.onLockChange}
            onDenied={input.onDenied}
          />
        </div>
      ) : null}
    </section>
  );
}
