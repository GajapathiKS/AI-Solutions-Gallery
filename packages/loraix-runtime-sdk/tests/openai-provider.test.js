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
