import { useState } from 'react';
import type { MeResponse } from '@spoh/shared';
import { Button, Card } from '@/shared/ui';
import { PrivateDraftWorkspace } from './PrivateDraftWorkspace';

export function PrivateDraftPanel({ me }: { me: MeResponse }) {
  const [open, setOpen] = useState(false);
  return (
    <Card as="section" className="flex flex-col gap-md">
      <Button
        variant="quiet"
        aria-expanded={open}
        aria-controls="private-announcement-drafts"
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide drafts and schedules' : 'Drafts and scheduled messages'}
      </Button>
      {open ? (
        <div id="private-announcement-drafts">
          <PrivateDraftWorkspace me={me} />
        </div>
      ) : null}
    </Card>
  );
}
