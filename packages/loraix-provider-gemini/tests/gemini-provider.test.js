import test from 'node:test';
import assert from 'node:assert/strict';

import { GeminiProvider } from '../src/index.js';

test('GeminiProvider maps generateContent response', async () => {
  const provider = new GeminiProvider({
    apiKey: 'k',
    fetchImpl: async (url) => {
      assert.match(url, /generateContent\?key=k$/);
      return {
        ok: true,
        async json() {
          return {
            candidates: [{ content: { parts: [{ text: 'hello' }] } }],
            usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 }
          };
        }
      };
    }
  });

  const out = await provider.generate({ model: 'gemini-1.5-flash', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(out.text, 'hello');
  assert.equal(out.usage.totalTokens, 5);
});

test('GeminiProvider throws for non-ok responses', async () => {
  const provider = new GeminiProvider({
    apiKey: 'k',
    fetchImpl: async () => ({ ok: false, status: 400, async text() { return 'bad request'; } })
  });

  await assert.rejects(provider.generate({ model: 'gemini-1.5-flash', messages: [] }));
});

test('GeminiProvider stream parses SSE deltas', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n'),
    encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}]}\n\n')
  ];

  const provider = new GeminiProvider({
    apiKey: 'k',
    fetchImpl: async () => ({
      ok: true,
      body: {
        getReader() {
          let i = 0;
          return {
            async read() {
              if (i >= chunks.length) return { done: true, value: undefined };
              return { done: false, value: chunks[i++] };
            }
          };
        }
      }
    })
  });

  const iterable = await provider.stream({ model: 'gemini-1.5-flash', messages: [] });
  let text = '';
  for await (const chunk of iterable) text += chunk;
  assert.equal(text, 'Hello');
});
