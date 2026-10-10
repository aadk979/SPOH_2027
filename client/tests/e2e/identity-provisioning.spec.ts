import { expect, test } from '@playwright/test';
import { RosterImportRequest, RosterImportResponse, type RosterImportRow } from '@spoh/shared';
import { mockIdentityUi, identityVolunteer, IDENTITY_EVENT } from './identityUiFixture';
for (const width of [390, 1440]) {
  test(`single invite and 50-person correction, preview, apply and one resend (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const imports: RosterImportRequest[] = [];
    const registered = new Set<string>();
    const people: RosterImportRow[] = Array.from({ length: 50 }, (_, index) => ({
      displayName: `Synthetic Person ${index + 1}`,
      email: `csv-person-${index + 1}@example.test`,
      role: 'VOLUNTEER',
    }));
    let invites = 0;
    const resends: { id: string; idempotencyKey: string }[] = [];
    await mockIdentityUi(page, {
      handle: async (route, path) => {
        if (path.endsWith('/admin/volunteers')) {
          expect(route.request().method()).toBe('GET');
          const data = people
            .filter((person) => registered.has(person.email))
            .map((person, index) =>
              identityVolunteer({ id: `synthetic-import-${index + 1}`, ...person }),
            );
          await route.fulfill({ json: { data, meta: { count: data.length, nextCursor: null } } });
          return true;
        }
        if (path.endsWith('/resend-invite')) {
          expect(route.request().method()).toBe('POST');
          expect(registered.size).toBe(50);
          const body = route.request().postDataJSON() as { idempotencyKey: string };
          expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
          resends.push({ id: path.split('/').at(-2)!, idempotencyKey: body.idempotencyKey });
          await route.fulfill({ json: { sent: true } });
          return true;
        }
        if (path.endsWith('/roster/volunteers')) {
          invites++;
          expect(route.request().postDataJSON()).toMatchObject({
            idempotencyKey: expect.any(String),
            email: 'new@example.test',
          });
          await route.fulfill({ json: { identityCreated: true } });
          return true;
        }
        if (path.endsWith('/roster/import')) {
          const body = RosterImportRequest.parse(route.request().postDataJSON());
          imports.push(body);
          expect(body.rows).toEqual(people);
          expect(new Set(body.rows.map((row) => row.email)).size).toBe(50);
          expect(body.idempotencyKey).toEqual(expect.any(String));
          const added = body.rows.filter((row) => !registered.has(row.email)).length;
          if (body.commit) body.rows.forEach((row) => registered.add(row.email));
          await route.fulfill({
            json: RosterImportResponse.parse({
              committed: body.commit,
              volunteersCreated: added,
              volunteersUpdated: body.rows.length - added,
              assignmentsCreated: 0,
              assignmentsUpdated: 0,
              issues: [],
            }),
          });
          return true;
        }
        return false;
      },
    });
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/users/invite`);
    await page.getByLabel('Name', { exact: true }).fill('Synthetic New Person');
    await page.getByLabel('Email', { exact: true }).fill('new@example.test');
    await page.getByRole('button', { name: 'Invite person', exact: true }).click();
    await expect(
      page.getByText('Invited. Their sign-in instructions are sent by Cognito.'),
    ).toBeVisible();
    expect(invites).toBe(1);
    const valid =
      'displayName,email,role\n' +
      people.map((person) => `${person.displayName},${person.email},${person.role}`).join('\n');
    const invalid = people
      .slice(0, 3)
      .reduce(
        (csv, person, index) => csv.replace(person.email, `invalid-email-${index + 1}`),
        valid,
      );
    await page.getByLabel('Roster CSV').fill(invalid);
    await page.getByRole('button', { name: 'Preview import' }).click();
    const errors = page.getByRole('alert');
    for (const line of [2, 3, 4]) await expect(errors).toContainText(`Line ${line}, email:`);
    expect((await errors.textContent())?.match(/Line \d+, email:/g)).toHaveLength(3);
    await expect(page.getByRole('button', { name: 'Apply reviewed import' })).toHaveCount(0);
    expect(imports).toHaveLength(0);
    expect(registered.size).toBe(0);
    await page.getByLabel('Roster CSV').fill(valid);
    await page.getByRole('button', { name: 'Preview import' }).click();
    await expect(
      page.getByText(/Preview: 50 people added, 0 updated, 0 shifts added/),
    ).toBeVisible();
    expect(imports).toHaveLength(1);
    expect(registered.size).toBe(0);
    await page.getByRole('button', { name: 'Apply reviewed import' }).click();
    await expect(
      page.getByText(/Applied: 50 people added, 0 updated, 0 shifts added/),
    ).toBeVisible();
    expect(imports.map((input) => input.commit)).toEqual([false, true]);
    expect(imports[1]!.rows).toEqual(imports[0]!.rows);
    expect(imports[1]!.idempotencyKey).not.toBe(imports[0]!.idempotencyKey);
    expect(registered.size).toBe(50);
    expect(resends).toEqual([]);
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/users`);
    await expect(page.getByRole('heading', { name: '50 volunteers', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manage', exact: true })).toHaveCount(50);
    await page.getByRole('button', { name: 'Manage', exact: true }).nth(16).click();
    await page.getByRole('button', { name: 'Resend sign-in invite', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Sign-in invite resent.' }),
    ).toBeVisible();
    expect(resends).toEqual([{ id: 'synthetic-import-17', idempotencyKey: expect.any(String) }]);
    expect(imports).toHaveLength(2);
    expect(registered.size).toBe(50);
    await expect(page.getByRole('heading', { name: '50 volunteers', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
