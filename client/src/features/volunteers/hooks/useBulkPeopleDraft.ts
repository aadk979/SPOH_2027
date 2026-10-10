import { useState } from 'react';
import {
  BulkPeopleRequest,
  type BulkPeopleRequest as BulkRequest,
  type VolunteerAdminRecord,
} from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useBulkPeople } from '../queries';

export function useBulkPeopleDraft(rows: VolunteerAdminRecord[]) {
  const [ids, setIds] = useState<string[]>([]);
  const [review, setReview] = useState<BulkRequest | null>(null);
  const form = useZodForm(BulkPeopleRequest, {
    action: 'resend' as BulkRequest['action'],
    reason: '',
    role: 'VOLUNTEER' as NonNullable<BulkRequest['role']>,
  });
  const apply = useBulkPeople();
  const selected = rows.filter((row) => ids.includes(row.id));
  function toggle(id: string): void {
    setIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
    setReview(null);
    apply.reset();
  }
  function preview(): void {
    const body = form.validate({
      ids: selected.map((row) => row.id),
      action: form.values.action,
      ...(form.values.action === 'deactivate' ? { reason: form.values.reason } : {}),
      ...(form.values.action === 'role' ? { role: form.values.role } : {}),
    });
    if (body) setReview(body);
  }
  function commit(): void {
    if (review && review.ids.every((id) => selected.some((row) => row.id === id)))
      apply.mutate(review, {
        onSuccess: () => {
          setReview(null);
          setIds([]);
        },
      });
  }
  const currentReview = review?.ids.every((id) => selected.some((row) => row.id === id))
    ? review
    : null;
  return { form, ids, selected, toggle, review: currentReview, setReview, preview, commit, apply };
}
