import test from 'node:test';
import assert from 'node:assert/strict';

import { DeepSeekProvider } from '../src/index.js';

test('DeepSeekProvider maps chat completion response', async () => {
  const provider = new DeepSeekProvider({
    apiKey: 'k',
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          choices: [{ message: { content: 'hello' } }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }
        };
      }
    })
  });

  const out = await provider.generate({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(out.text, 'hello');
  assert.equal(out.usage.totalTokens, 5);
});

test('DeepSeekProvider throws for non-ok responses', async () => {
  const provider = new DeepSeekProvider({
    apiKey: 'k',
    fetchImpl: async () => ({ ok: false, status: 429, async text() { return 'rate limited'; } })
  });

  await assert.rejects(provider.generate({ model: 'deepseek-chat', messages: [] }));
});

test('DeepSeekProvider stream parses text deltas', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode('data: {"choices":[{"delta":{"content":"He"}}]}\n\n'),
    encoder.encode('data: {"choices":[{"delta":{"content":"llo"}}]}\n\n'),
    encoder.encode('data: [DONE]\n\n')
  ];

  const provider = new DeepSeekProvider({
    apiKey: 'k',
    fetchImpl: async () => ({
      ok: true,
      body: {
        getReader() {
          let i = 0;
          return {
            async read() {
              if (i >= chunks.length) {
                return { done: true, value: undefined };
              }
              const value = chunks[i];
              i += 1;
              return { done: false, value };
            }
          };
        }
      }
    })
  });

  const iterable = await provider.stream({ model: 'deepseek-chat', messages: [] });
  let text = '';
  for await (const chunk of iterable) {
    text += chunk;
  }

  assert.equal(text, 'Hello');
});
