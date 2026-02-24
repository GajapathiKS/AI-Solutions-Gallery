import test from 'node:test';
import assert from 'node:assert/strict';

import { AnthropicProvider } from '../src/index.js';

test('AnthropicProvider maps messages response', async () => {
  const provider = new AnthropicProvider({
    apiKey: 'k',
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          content: [{ type: 'text', text: 'hello' }],
          usage: { input_tokens: 2, output_tokens: 3 }
        };
      }
    })
  });

  const out = await provider.generate({ model: 'claude', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(out.text, 'hello');
  assert.equal(out.usage.totalTokens, 5);
});

test('AnthropicProvider throws for non-ok responses', async () => {
  const provider = new AnthropicProvider({
    apiKey: 'k',
    fetchImpl: async () => ({ ok: false, status: 401, async text() { return 'nope'; } })
  });

  await assert.rejects(provider.generate({ model: 'claude', messages: [] }));
});

test('AnthropicProvider stream parses text deltas', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode('data: {"type":"content_block_delta","delta":{"text":"Hel"}}\n\n'),
    encoder.encode('data: {"type":"content_block_delta","delta":{"text":"lo"}}\n\n')
  ];

  const provider = new AnthropicProvider({
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

  const iterable = await provider.stream({ model: 'claude', messages: [] });
  let text = '';
  for await (const chunk of iterable) {
    text += chunk;
  }

  assert.equal(text, 'Hello');
});
