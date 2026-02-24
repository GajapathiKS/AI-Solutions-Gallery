import test from 'node:test';
import assert from 'node:assert/strict';

import { AzureOpenAIProvider } from '../src/index.js';

test('AzureOpenAIProvider builds deployment endpoint and maps response', async () => {
  const provider = new AzureOpenAIProvider({
    apiKey: 'k',
    resourceName: 'myresource',
    deployment: 'gpt-4o-mini',
    fetchImpl: async (url) => {
      assert.match(url, /^https:\/\/myresource\.openai\.azure\.com\/openai\/deployments\/gpt-4o-mini\/chat\/completions\?api-version=/);
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: 'hello' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
          };
        }
      };
    }
  });

  const out = await provider.generate({ model: 'ignored-by-azure-deployment', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(out.text, 'hello');
  assert.equal(out.usage.totalTokens, 2);
});

test('AzureOpenAIProvider throws for non-ok responses', async () => {
  const provider = new AzureOpenAIProvider({
    apiKey: 'k',
    baseUrl: 'https://example.azure.com',
    deployment: 'dep',
    fetchImpl: async () => ({ ok: false, status: 401, async text() { return 'unauthorized'; } })
  });

  await assert.rejects(provider.generate({ model: 'm', messages: [] }));
});

test('AzureOpenAIProvider stream parses SSE delta content', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\r\n\r\n'),
    encoder.encode('data: {"choices":[{"delta":{"content":"lo"}}]}\r\n\r\n'),
    encoder.encode('data: [DONE]\r\n\r\n')
  ];

  const provider = new AzureOpenAIProvider({
    apiKey: 'k',
    baseUrl: 'https://example.azure.com',
    deployment: 'dep',
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

  const iterable = await provider.stream({ model: 'm', messages: [] });
  let text = '';
  for await (const chunk of iterable) text += chunk;
  assert.equal(text, 'Hello');
});
