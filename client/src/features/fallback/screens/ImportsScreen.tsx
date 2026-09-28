'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/shared/shell/AppShell';
import { Stack } from '@/shared/ui';
import { useRequireSession } from '@/features/session';
import { useImportForm } from '../hooks/useImportForm';
import { ImportSourceForm } from '../components/ImportSourceForm';
import { ImportPreview } from '../components/ImportPreview';
import { ImportResult } from '../components/ImportResult';

/**
 * Reconciliation imports (ADR-007 §1; remediation P07.5).
 *
 * Recovery matters as much as capture. A fallback with no import path is a
 * fallback that loses the data it was built to save.
 *
 * Two things this screen insists on:
 *
 *  - Preview first, always. The commit button only appears after a dry run, and
 *    it shows exactly what the dry run said would happen. Bringing an outage
 *    worth of counts into the real dataset is the operation you most want to
 *    see the diff of.
 *
 *  - Every imported row is source-tagged. There is no "just add these as normal
 *    taps" option, because a report that quietly mixes app data and paper
 *    estimates is worse than one that says which hour is approximate.
 */

export default function ImportsScreen(): ReactNode {
  const session = useRequireSession();

  const form = useImportForm();
  const { preview, result } = form;

  if (!session) return null;

  return (
    <AppShell
      width="reading"
      title="Import fallback data"
      back={{ href: '/chief', label: 'Live operations' }}
    >
      <Stack>
        <p className="text-text-muted">
          Paste the rows from the fallback sheet or the paper tally. Everything imported is tagged
          with where it came from, and every report will say so.
        </p>

        <ImportSourceForm form={form} />

        {preview ? <ImportPreview form={form} /> : null}

        {result ? <ImportResult form={form} /> : null}
      </Stack>
    </AppShell>
  );
}
