import test from 'node:test';
import assert from 'node:assert/strict';

import { OpenAIProvider } from '../src/index.js';

test('OpenAIProvider maps chat completion response', async () => {
  const provider = new OpenAIProvider({
    apiKey: 'k',
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          choices: [{ message: { content: 'hello' } }],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
        };
      }
    })
  });

  const out = await provider.generate({ model: 'm', messages: [], temperature: 0, maxTokens: 10 });
  assert.equal(out.text, 'hello');
  assert.equal(out.usage.totalTokens, 3);
});

test('OpenAIProvider throws for non-ok responses', async () => {
  const provider = new OpenAIProvider({
    apiKey: 'k',
    fetchImpl: async () => ({ ok: false, status: 401, async text() { return 'nope'; } })
  });

  await assert.rejects(provider.generate({ model: 'm', messages: [] }));
});

test('OpenAIProvider stream parses CRLF-delimited SSE frames', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode('data: {"choices":[{"delta":{"content":"He"}}]}\r\n\r\n'),
    encoder.encode('data: {"choices":[{"delta":{"content":"llo"}}]}\r\n\r\n'),
    encoder.encode('data: [DONE]\r\n\r\n')
  ];

  const provider = new OpenAIProvider({
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

  const iterable = await provider.stream({ model: 'm', messages: [] });
  let text = '';
  for await (const chunk of iterable) {
    text += chunk;
  }

  assert.equal(text, 'Hello');
});
