import test from 'node:test';
import assert from 'node:assert/strict';

import { GrokProvider } from '../src/index.js';

test('GrokProvider maps chat completion response', async () => {
  const provider = new GrokProvider({
    apiKey: 'k',
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          choices: [{ message: { content: 'hello' } }],
          usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 }
        };
      }
    })
  });

  const out = await provider.generate({ model: 'grok-2-latest', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(out.text, 'hello');
  assert.equal(out.usage.totalTokens, 5);
});

test('GrokProvider throws for non-ok responses', async () => {
  const provider = new GrokProvider({
    apiKey: 'k',
    fetchImpl: async () => ({ ok: false, status: 500, async text() { return 'upstream error'; } })
  });

  await assert.rejects(provider.generate({ model: 'grok-2-latest', messages: [] }));
});

test('GrokProvider stream parses text deltas', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode('data: {"choices":[{"delta":{"content":"He"}}]}\r\n\r\n'),
    encoder.encode('data: {"choices":[{"delta":{"content":"llo"}}]}\r\n\r\n'),
    encoder.encode('data: [DONE]\r\n\r\n')
  ];

  const provider = new GrokProvider({
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

  const iterable = await provider.stream({ model: 'grok-2-latest', messages: [] });
  let text = '';
  for await (const chunk of iterable) {
    text += chunk;
  }

  assert.equal(text, 'Hello');
});
