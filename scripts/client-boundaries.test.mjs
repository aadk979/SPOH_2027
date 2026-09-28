import assert from 'node:assert/strict';
import test from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint();
const errors = async (code, filePath) =>
  (await eslint.lintText(code, { filePath }))[0].messages.filter(
    (message) => message.ruleId === 'no-restricted-syntax',
  );

test('screens cannot own endpoint requests or query definitions', async () => {
  const messages = await errors(
    "api('/stations'); fetch('/stations'); useQuery({ queryKey: ['stations'] }); useMutation({}); const capture = { endpoint: '/registrations' };",
    'client/src/app/guard-fixture/page.tsx',
  );
  assert.equal(messages.length, 6);
});

test('feature endpoint and query files retain their respective responsibilities', async () => {
  assert.deepEqual(
    await errors("fetch('/stations');", 'client/src/features/guard-fixture/api.ts'),
    [],
  );
  assert.deepEqual(
    await errors(
      "useQuery({ queryKey: ['stations'] });",
      'client/src/features/guard-fixture/queries.ts',
    ),
    [],
  );
  assert.equal(
    (await errors("api('/stations');", 'client/src/features/guard-fixture/queries.ts')).length,
    1,
  );
});
