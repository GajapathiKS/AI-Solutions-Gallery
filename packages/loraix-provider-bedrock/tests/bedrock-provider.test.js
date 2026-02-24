import test from 'node:test';
import assert from 'node:assert/strict';

import { BedrockProvider } from '../src/index.js';

test('BedrockProvider requires region when no client override is provided', () => {
  assert.throws(() => new BedrockProvider(), /requires region/);
});

test('BedrockProvider rejects apiKey and requires SigV4 credentials', () => {
  assert.throws(
    () => new BedrockProvider({ apiKey: 'x', region: 'us-east-1' }),
    /does not use apiKey/
  );
});

test('BedrockProvider maps Converse response for all model IDs', async () => {
  const provider = new BedrockProvider({
    bedrockClient: {
      async send(command, options) {
        assert.equal(command.input.modelId, 'anthropic.claude-3-5-sonnet-20240620-v1:0');
        assert.equal(command.input.system[0].text, 'be concise');
        assert.equal(command.input.messages[0].role, 'user');
        assert.equal(command.input.messages[0].content[0].text, 'hi');
        assert.equal(options.abortSignal, undefined);

        return {
          output: {
            message: {
              content: [{ text: 'hello' }]
            }
          },
          usage: {
            inputTokens: 2,
            outputTokens: 3,
            totalTokens: 5
          }
        };
      }
    }
  });

  const out = await provider.generate({
    model: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
    messages: [
      { role: 'system', content: 'be concise' },
      { role: 'user', content: 'hi' }
    ]
  });

  assert.equal(out.text, 'hello');
  assert.equal(out.usage.totalTokens, 5);
});

test('BedrockProvider stream yields text deltas from ConverseStream events', async () => {
  const provider = new BedrockProvider({
    bedrockClient: {
      async send(command) {
        assert.equal(command.input.modelId, 'us.anthropic.claude-3-5-sonnet-20240620-v1:0');
        return {
          stream: (async function* () {
            yield { contentBlockDelta: { delta: { text: 'Hel' } } };
            yield { contentBlockDelta: { delta: { text: 'lo' } } };
            yield { messageStop: { stopReason: 'end_turn' } };
          }())
        };
      }
    }
  });

  const iterable = await provider.stream({
    model: 'us.anthropic.claude-3-5-sonnet-20240620-v1:0',
    messages: [{ role: 'user', content: 'Say hello' }]
  });

  let text = '';
  for await (const chunk of iterable) {
    text += chunk;
  }

  assert.equal(text, 'Hello');
});
