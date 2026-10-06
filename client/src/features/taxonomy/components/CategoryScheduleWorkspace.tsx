import { useEffect, useState } from 'react';
import type { CategoryActivityRecord } from '@spoh/shared';
import { Button, Callout, Field, LoadingRows, Select } from '@/shared/ui';
import { useCategoryActivityList } from '../queries';
import { CategoryScheduleContents } from './CategoryScheduleContents';
import { categoryAccessDenied } from '../model/access';
import { categoryPageRows } from '../model/collection';

export function CategoryScheduleWorkspace({
  timezone,
  accessAvailable,
  onLockChange,
  onDenied,
}: {
  timezone: string;
  accessAvailable: boolean;
  onLockChange: (locked: boolean) => void;
  onDenied: () => void;
}) {
  const categories = useCategoryActivityList(accessAvailable);
  const [categoryId, setCategoryId] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const denied = categoryAccessDenied(categories.error);
  useEffect(() => {
    if (denied) onDenied();
  }, [denied, onDenied]);
  const rows = categoryPageRows(categories.data, categories.isError).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
  return (
    <div className="flex flex-col gap-md">
      <p>Review every category page, including inactive categories, before selecting a category.</p>
      {categories.isPending ? <LoadingRows label="Loading capture categories" /> : null}
      {categories.isError ? (
        <Callout role="alert" tone="alert">
          Capture categories are unavailable. Reload before reviewing.
        </Callout>
      ) : null}
      <CategorySchedulePicker
        categoryId={categoryId}
        rows={rows}
        categories={categories}
        reviewing={reviewing}
        accessAvailable={accessAvailable}
        onChange={setCategoryId}
      />
      <Button
        variant="quiet"
        disabled={!accessAvailable || categories.isFetching}
        onClick={() => accessAvailable && void categories.refetch()}
      >
        Reload capture categories
      </Button>
      {categories.hasNextPage && !categories.isError ? (
        <Button
          variant="quiet"
          disabled={!accessAvailable || reviewing || categories.isFetching}
          onClick={() => accessAvailable && void categories.fetchNextPage()}
        >
          Load more capture categories
        </Button>
      ) : null}
      {categoryId ? (
        <CategoryScheduleContents
          key={categoryId}
          categoryId={categoryId}
          timezone={timezone}
          accessAvailable={accessAvailable}
          readUnavailable={categories.isError}
          onReviewingChange={setReviewing}
          onLockChange={onLockChange}
          onDenied={onDenied}
        />
      ) : null}
    </div>
  );
}
function CategorySchedulePicker(input: {
  categoryId: string;
  rows: CategoryActivityRecord[];
  categories: ReturnType<typeof useCategoryActivityList>;
  reviewing: boolean;
  accessAvailable: boolean;
  onChange: (categoryId: string) => void;
}) {
  return (
    <Field id="scheduled-category-picker" label="Capture category">
      {(props) => (
        <Select
          {...props}
          value={input.categoryId}
          disabled={
            !input.accessAvailable ||
            input.reviewing ||
            !input.categories.isSuccess ||
            input.categories.isError ||
            input.categories.hasNextPage
          }
          onChange={(event) => input.onChange(event.target.value)}
        >
          <option value="">Choose a category</option>
          {input.rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.code} · {row.label} · {row.active ? 'Active' : 'Inactive'}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
