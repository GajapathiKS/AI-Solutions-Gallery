import test from 'node:test';
import assert from 'node:assert/strict';

import { LoraixRuntime, LoraixJsonValidationError } from '../src/index.js';

function fakeProvider({ name = 'fake', onGenerate, onStream } = {}) {
  return {
    name,
    async generate(request, ctx) {
      return onGenerate(request, ctx);
    },
    async stream(request, ctx) {
      if (!onStream) {
        throw new Error('no stream');
      }
      return onStream(request, ctx);
    }
  };
}

test('generate succeeds and returns unified response', async () => {
  const ai = new LoraixRuntime({
    provider: fakeProvider({
      onGenerate: async () => ({ text: 'ok', usage: { totalTokens: 5 }, raw: { id: 1 } })
    }),
    model: 'x'
  });

  const out = await ai.generate('hello');
  assert.equal(out.text, 'ok');
  assert.equal(out.provider, 'fake');
  assert.equal(out.usage.totalTokens, 5);
  assert.equal(out.attempts, 1);
});

test('retries retryable errors and then succeeds', async () => {
  let calls = 0;
  const ai = new LoraixRuntime({
    provider: fakeProvider({
      onGenerate: async () => {
        calls += 1;
        if (calls < 3) {
          const err = new Error('busy');
          err.status = 429;
          throw err;
        }
        return { text: 'done' };
      }
    }),
    model: 'x',
    maxRetries: 3,
    retryStrategy: { computeDelay: () => 0 }
  });

  const out = await ai.generate('retry me');
  assert.equal(out.text, 'done');
  assert.equal(calls, 3);
  assert.equal(out.attempts, 3);
});

test('uses fallback provider after retry exhaustion', async () => {
  const primary = fakeProvider({
    name: 'primary',
    onGenerate: async () => {
      const err = new Error('down');
      err.status = 503;
      throw err;
    }
  });

  const fallback = fakeProvider({
    name: 'fallback',
    onGenerate: async () => ({ text: 'fallback ok' })
  });

  const ai = new LoraixRuntime({
    provider: primary,
    fallbackProviders: [fallback],
    model: 'x',
    maxRetries: 1,
    retryStrategy: { computeDelay: () => 0 }
  });

  const out = await ai.generate('test');
  assert.equal(out.text, 'fallback ok');
  assert.equal(out.provider, 'fallback');
  assert.equal(out.fallbackUsed, true);
  assert.equal(out.attempts, 3);
});

test('json mode validates schema and retries once', async () => {
  let count = 0;
  const ai = new LoraixRuntime({
    provider: fakeProvider({
      onGenerate: async () => {
        count += 1;
        if (count === 1) {
          return { text: '{"name":"Ava","age":"bad"}' };
        }
        return { text: '{"name":"Ava","age":42}' };
      }
    }),
    model: 'x'
  });

  const out = await ai.json({ prompt: 'profile', schema: { name: 'string', age: 'number' } });
  assert.equal(out.json.name, 'Ava');
  assert.equal(out.json.age, 42);
});

test('json mode throws validation error after second failure', async () => {
  const ai = new LoraixRuntime({
    provider: fakeProvider({
      onGenerate: async () => ({ text: '{"name":123}' })
    }),
    model: 'x'
  });

  await assert.rejects(
    ai.json({ prompt: 'bad', schema: { name: 'string' } }),
    LoraixJsonValidationError
  );
});

test('stream yields provider chunks', async () => {
  const ai = new LoraixRuntime({
    provider: fakeProvider({
      onGenerate: async () => ({ text: '' }),
      onStream: async () => ({
        async *[Symbol.asyncIterator]() {
          yield 'a';
          yield 'b';
        }
      })
    }),
    model: 'x'
  });

  let combined = '';
  for await (const chunk of ai.stream('stream')) {
    combined += chunk;
  }

  assert.equal(combined, 'ab');
});

test('generate honors per-call options embedded in object input', async () => {
  let captured;
  const ai = new LoraixRuntime({
    provider: fakeProvider({
      onGenerate: async (request) => {
        captured = request;
        return { text: 'ok' };
      }
    }),
    model: 'default-model',
    temperature: 0
  });

  await ai.generate({
    messages: [{ role: 'user', content: 'hello' }],
    model: 'override-model',
    temperature: 0.7,
    maxTokens: 123
  });

  assert.equal(captured.model, 'override-model');
  assert.equal(captured.temperature, 0.7);
  assert.equal(captured.maxTokens, 123);
});

test('generate aborts in-flight provider call when timeout is hit', async () => {
  let capturedSignal;
  const ai = new LoraixRuntime({
    provider: fakeProvider({
      onGenerate: async (_request, ctx) => {
        capturedSignal = ctx.signal;
        return new Promise(() => {});
      }
    }),
    model: 'x',
    maxRetries: 0
  });

  await assert.rejects(
    ai.generate('slow', { timeoutMs: 10 }),
    (error) => error?.timeout === true
  );

  assert.equal(capturedSignal.aborted, true);
});

test('stream times out if stream stalls after setup', async () => {
  const ai = new LoraixRuntime({
    provider: fakeProvider({
      onGenerate: async () => ({ text: '' }),
      onStream: async () => ({
        async *[Symbol.asyncIterator]() {
          yield 'first';
          await new Promise((resolve) => setTimeout(resolve, 50));
          yield 'second';
        }
      })
    }),
    model: 'x',
    maxRetries: 0
  });

  const collected = [];
  await assert.rejects(
    (async () => {
      for await (const chunk of ai.stream('stall', { timeoutMs: 10 })) {
        collected.push(chunk);
      }
    })(),
    (error) => error?.timeout === true
  );

  assert.deepEqual(collected, ['first']);
});

test('stream timeout calls iterator.return for cleanup', async () => {
  let returnCalled = false;
  const iterable = {
    [Symbol.asyncIterator]() {
      let idx = 0;
      return {
        async next() {
          if (idx === 0) {
            idx += 1;
            return { done: false, value: 'first' };
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { done: false, value: 'second' };
        },
        async return() {
          returnCalled = true;
          return { done: true, value: undefined };
        }
      };
    }
  };

  const ai = new LoraixRuntime({
    provider: fakeProvider({
      onGenerate: async () => ({ text: '' }),
      onStream: async () => iterable
    }),
    model: 'x',
    maxRetries: 0
  });

  await assert.rejects(
    (async () => {
      for await (const _chunk of ai.stream('stall', { timeoutMs: 10 })) {
        // consume until timeout
      }
    })(),
    (error) => error?.timeout === true
  );

  assert.equal(returnCalled, true);
});
