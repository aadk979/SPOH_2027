import type { ReactNode } from 'react';
import type { FoundItemFormState } from '../hooks/useFoundItemForm';
import { Field, Input } from '@/shared/ui';
export function FoundItemFields({ form }: { form: FoundItemFormState }): ReactNode {
  const {
    itemLabel,
    setItemLabel,
    categoryLabel,
    setCategoryLabel,
    holderNote,
    setHolderNote,
    itemError,
  } = form;
  return (
    <>
      <Field
        id="item"
        label="What is it?"
        hint="Describe it the way somebody would ask for it."
        error={itemError}
      >
        {(props) => (
          <Input
            {...props}
            required
            minLength={2}
            maxLength={120}
            value={itemLabel}
            onChange={(event) => {
              setItemLabel(event.target.value);
            }}
            placeholder="Blue metal water bottle with stickers"
            scale="lg"
          />
        )}
      </Field>

      <Field id="category" error={form.errors.categoryLabel} label="Kind of thing" optional>
        {(props) => (
          <Input
            {...props}
            maxLength={60}
            value={categoryLabel}
            onChange={(event) => setCategoryLabel(event.target.value)}
            placeholder="Bottle, bag, phone, clothing…"
          />
        )}
      </Field>

      <Field
        id="holder"
        error={form.errors.holderNote}
        label="Where is it being kept?"
        optional
        hint="The field people forget, and the one that makes it findable again."
      >
        {(props) => (
          <Input
            {...props}
            maxLength={200}
            value={holderNote}
            onChange={(event) => setHolderNote(event.target.value)}
            placeholder="Held at the Mission Complete desk"
          />
        )}
      </Field>
    </>
  );
}
