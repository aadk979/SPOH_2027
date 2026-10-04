import { useState } from 'react';
import { EventSettingKey } from '@spoh/shared';
import { useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { Button, Field, Select } from '@/shared/ui';
import { productSettingLabels } from '../model/productHistory';
import { ProductHistoryContents } from './ProductHistoryContents';

/** The private history queries exist only while the authorised person expands this panel. */
export function ProductHistoryPanel({ enabled }: { enabled: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [key, setKey] = useState<EventSettingKey>('product.countsMode');
  const session = useCurrentSession();
  const eventId = useEventId();
  if (!enabled || !session) return null;
  return (
    <div className="flex flex-col gap-md">
      <Button
        variant="secondary"
        className="hover:bg-surface"
        aria-expanded={expanded}
        aria-controls="product-setting-history"
        onClick={() => setExpanded(!expanded)}
      >
        Setting history and restore
      </Button>
      {expanded ? (
        <div id="product-setting-history" className="flex flex-col gap-md">
          <Field id="product-history-key" label="Setting history for">
            {(props) => (
              <Select
                {...props}
                value={key}
                onChange={(event) => setKey(EventSettingKey.parse(event.target.value))}
              >
                {EventSettingKey.options.map((value) => (
                  <option key={value} value={value}>
                    {productSettingLabels[value]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <ProductHistoryContents
            key={`${eventId}:${session.volunteerId}:${key}`}
            settingKey={key}
          />
        </div>
      ) : null}
    </div>
  );
}
