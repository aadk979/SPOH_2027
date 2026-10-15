import { randomUUID } from 'node:crypto';
export function captureValidationCases({
  stationId,
  category,
  giftTypeId,
  cardShortCode,
}: {
  stationId: string;
  category: string;
  giftTypeId: string;
  cardShortCode: string;
}) {
  const definitions: Array<[string, string, Record<string, unknown>]> = [
    ['registration', '/registrations', { stationId, category }],
    ['group', '/registrations/group', { stationId, members: [{ category, count: 1 }] }],
    ['footfall', '/footfall/ticks', { stationId }],
    [
      'bulk',
      '/footfall/bulk',
      {
        stationId,
        quantity: 1,
        timeBlockStart: new Date().toISOString(),
        source: 'PAPER',
        reason: 'Synthetic validation only.',
      },
    ],
    ['redemption', '/gifts/redemptions', { stationId, giftTypeId }],
    ['issue', '/cards/' + cardShortCode + '/issue', {}],
    ['stamp', '/cards/' + cardShortCode + '/stamps', { stationId }],
  ];
  const out: Array<{
    id: string;
    method: 'POST';
    path: string;
    body: Record<string, unknown>;
    expectedStatus: 400;
  }> = [];
  for (const [name, path, fields] of definitions) {
    const base = { idempotencyKey: randomUUID(), rehearsal: false, ...fields };
    function add(label: string, patch: Record<string, unknown>, remove?: string) {
      const body: Record<string, unknown> = { ...base, ...patch, idempotencyKey: randomUUID() };
      if (remove) delete body[remove];
      out.push({ id: name + ':' + label, method: 'POST', path, body, expectedStatus: 400 });
    }
    add('missing-idempotency-key', {}, 'idempotencyKey');
    for (const [label, value] of [
      ['null', null],
      ['number', 1],
      ['malformed', 'invalid'],
      ['overlong', 'x'.repeat(100)],
    ]) {
      const body = { ...base, idempotencyKey: value };
      out.push({ id: name + ':key-' + label, method: 'POST', path, body, expectedStatus: 400 });
    }
    for (const [label, value] of [
      ['null', null],
      ['text', 'false'],
      ['number', 0],
    ])
      add('mode-' + label, { rehearsal: value });
    for (const [label, value] of [
      ['null', null],
      ['number', 1],
      ['malformed', 'not-a-date'],
      ['overlong', 'x'.repeat(100)],
    ])
      add('client-time-' + label, { clientRecordedAt: value });
    add('unknown-key', { unexpected: true });
    if ('stationId' in fields) {
      add('missing-station', {}, 'stationId');
      for (const [label, value] of [
        ['null', null],
        ['number', 1],
        ['empty', ''],
      ])
        add('station-' + label, { stationId: value });
    }
    if (name === 'registration') {
      add('missing-category', {}, 'category');
      for (const [label, value] of [
        ['null', null],
        ['number', 1],
        ['empty', ''],
        ['invalid', 'invalid category'],
        ['overlong', 'X'.repeat(41)],
      ])
        add('category-' + label, { category: value });
      for (const [label, value] of [
        ['null', null],
        ['text', 'private'],
        ['array', []],
      ])
        add('visitor-' + label, { visitor: value });
    }
    if (name === 'group') {
      add('missing-members', {}, 'members');
      for (const [label, value] of [
        ['null', null],
        ['text', 'members'],
        ['empty', []],
        ['too-many-groups', Array.from({ length: 9 }, () => ({ category, count: 1 }))],
        ['missing-category', [{ count: 1 }]],
        ['category-type', [{ category: 1, count: 1 }]],
        ['missing-count', [{ category }]],
        ['zero-count', [{ category, count: 0 }]],
        ['count-type', [{ category, count: '1' }]],
        ['fractional-count', [{ category, count: 1.5 }]],
        ['over-count', [{ category, count: 21 }]],
        [
          'total-over-twenty',
          [
            { category, count: 20 },
            { category, count: 1 },
          ],
        ],
        ['unknown-member-key', [{ category, count: 1, unexpected: true }]],
      ])
        add('members-' + label, { members: value });
      for (const [label, value] of [
        ['null', null],
        ['number', 1],
        ['short', 'ABC'],
        ['long', 'ABCDEFG'],
      ])
        add('card-' + label, { missionCardShortCode: value });
    }
    if (name === 'bulk') {
      for (const key of ['quantity', 'timeBlockStart', 'source', 'reason'])
        add('missing-' + key, {}, key);
      for (const [label, value] of [
        ['null', null],
        ['text', '1'],
        ['zero', 0],
        ['negative', -1],
        ['fractional', 1.5],
        ['over', 5001],
      ])
        add('quantity-' + label, { quantity: value });
      for (const [label, value] of [
        ['null', null],
        ['number', 1],
        ['invalid', 'not-a-date'],
      ])
        add('block-time-' + label, { timeBlockStart: value });
      for (const [label, value] of [
        ['null', null],
        ['number', 1],
        ['invalid', 'APP'],
      ])
        add('source-' + label, { source: value });
      for (const [label, value] of [
        ['null', null],
        ['number', 1],
        ['short', 'ab'],
        ['long', 'x'.repeat(501)],
      ])
        add('reason-' + label, { reason: value });
    }
    if (name === 'redemption') {
      add('missing-gift', {}, 'giftTypeId');
      for (const [label, value] of [
        ['null', null],
        ['number', 1],
        ['empty', ''],
        ['long', 'x'.repeat(65)],
      ])
        add('gift-' + label, { giftTypeId: value });
      for (const key of ['acknowledgeWarning', 'queued'])
        for (const [label, value] of [
          ['null', null],
          ['text', 'false'],
          ['number', 0],
        ])
          add(key + '-' + label, { [key]: value });
      for (const [label, value] of [
        ['null', null],
        ['number', 1],
        ['short', 'ABC'],
        ['long', 'ABCDEFG'],
        ['invalid', '!!!!!!'],
      ])
        add('card-' + label, { cardShortCode: value });
    }
    if (name === 'issue')
      for (const [label, value] of [
        ['null', null],
        ['number', 1],
        ['empty', ''],
        ['long', 'x'.repeat(65)],
      ])
        add('group-' + label, { groupId: value });
    if (name === 'stamp')
      for (const [label, value] of [
        ['null', null],
        ['text', 'false'],
        ['number', 0],
      ])
        add('acknowledge-' + label, { acknowledgeDuplicate: value });
  }
  return out;
}
