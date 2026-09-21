#!/usr/bin/env node
// Smoke test for the DigitalOcean Gradient AI inference endpoint.
//
// Usage:
//   DO_AI_TOKEN=<token> node test/do-inference.mjs
//   DO_AI_TOKEN=<token> node test/do-inference.mjs "What is 2 + 2?"

const token = process.env.DO_AI_TOKEN;
const prompt = process.argv[2] ?? 'Hello';
const model = process.env.DO_AI_MODEL ?? 'openai-gpt-oss-120b';

if (!token) {
  console.error('Missing DO_AI_TOKEN. Run: DO_AI_TOKEN=<token> node test/do-inference.mjs');
  process.exit(1);
}

const response = await fetch('https://inference.do-ai.run/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 1,
    top_p: 1,
    max_tokens: 2048,
  }),
});

const body = await response.text();

if (!response.ok) {
  console.error(`HTTP ${response.status} ${response.statusText}`);
  console.error(body);
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(body);
} catch {
  console.error('Response was not JSON:');
  console.error(body);
  process.exit(1);
}

console.log(JSON.stringify(payload, null, 2));

const content = payload.choices?.[0]?.message?.content;
if (content) {
  console.log('\n--- content ---');
  console.log(content);
}
