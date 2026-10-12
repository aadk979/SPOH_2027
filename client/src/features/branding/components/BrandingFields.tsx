import type { BrandingDraft } from '@spoh/shared';
import { Button, Field, Input, Stack } from '@/shared/ui';
import type { FormErrors } from '@/shared/hooks/useZodForm';

export function BrandingFields({ value, errors, disabled, onChange, onUpload }: {
  value: BrandingDraft; errors: FormErrors; disabled: boolean;
  onChange: (next: BrandingDraft) => void; onUpload: (file: File) => void;
}) {
  return <Stack>
    <Field id="branding-accent" label="Accent colour" hint="Use #rrggbb. Links and buttons use contrast-safe variants; safety colours stay fixed." error={errors.accent}>
      {(props) => <Input {...props} value={value.accent} disabled={disabled} maxLength={7} onChange={(event) => onChange({ ...value, accent: event.target.value })} />}
    </Field>
    <Field id="branding-alt" label="Logo description" hint="Describe the organisation mark. Required for an uploaded logo." error={errors.logoAlt} optional>
      {(props) => <Input {...props} value={value.logoAlt ?? ''} disabled={disabled} maxLength={160} onChange={(event) => onChange({ ...value, logoAlt: event.target.value || null })} />}
    </Field>
    <Field id="branding-file" label="Upload logo" hint="PNG, JPEG or WebP; one image, up to 1 MB and 4096 pixels per side. Save the draft to review normalized icons before publishing." error={errors.uploadReceiptId} optional>
      {(props) => <Input {...props} type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); }} />}
    </Field>
    {value.uploadReceiptId ? <Button variant="quiet" disabled={disabled} onClick={() => onChange({ ...value, uploadReceiptId: null, logoAlt: null })}>Remove draft logo</Button> : null}
  </Stack>;
}
