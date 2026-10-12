import { Button, ErrorState } from '@/shared/ui';
import { useAllows, useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { usePhotoRead } from '../queries';
export function PhotoRead({ objectKey, label }: { objectKey: string; label: string }) {
  const session = useCurrentSession();
  const eventId = useEventId();
  const allowed = useAllows()('Self.Read');
  return session && allowed ? (
    <PhotoReader
      key={`${eventId}:${session.volunteerId}:${session.role}:${objectKey}`}
      objectKey={objectKey}
      label={label}
    />
  ) : null;
}
function PhotoReader({ objectKey, label }: { objectKey: string; label: string }) {
  const photo = usePhotoRead(objectKey);
  return (
    <div>
      <Button variant="quiet" disabled={photo.isPending} onClick={() => photo.mutate()}>
        View photo of {label}
      </Button>
      {photo.error ? <ErrorState error={photo.error} /> : null}
      {photo.data && !photo.isError ? (
        <a href={photo.data.url} target="_blank" rel="noopener noreferrer">
          Open photo of {label}
        </a>
      ) : null}
    </div>
  );
}
