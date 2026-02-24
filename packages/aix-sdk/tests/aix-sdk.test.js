import test from 'node:test';
import assert from 'node:assert/strict';

import { AixSDKError, createAixClient, createProvider, createAixRuntime, loadProviderCtor } from '../src/index.js';

test('createProvider uses injected provider ctor', async () => {
  class FakeProvider {
    constructor(options) {
      this.options = options;
    }
  }

  const provider = await createProvider('openai', { apiKey: 'k' }, { providerCtor: FakeProvider });
  assert.ok(provider instanceof FakeProvider);
  assert.equal(provider.options.apiKey, 'k');
});

test('createAixRuntime uses injected runtime ctor', async () => {
  class FakeRuntime {
    constructor(config) {
      this.config = config;
    }
  }

  const runtime = await createAixRuntime({ model: 'x' }, { LoraixRuntime: FakeRuntime });
  assert.ok(runtime instanceof FakeRuntime);
  assert.equal(runtime.config.model, 'x');
});

test('createAixClient wires provider + runtime together', async () => {
  class FakeProvider {
    constructor(options) {
      this.options = options;
    }
  }

  class FakeRuntime {
    constructor(config) {
      this.config = config;
    }
  }

  const runtime = await createAixClient(
    {
      provider: 'openai',
      providerOptions: { apiKey: 'k' },
      model: 'm',
      runtimeOptions: { timeoutMs: 1000 }
    },
    {
      providerCtor: FakeProvider,
      LoraixRuntime: FakeRuntime
    }
  );

  assert.ok(runtime instanceof FakeRuntime);
  assert.ok(runtime.config.provider instanceof FakeProvider);
  assert.equal(runtime.config.model, 'm');
  assert.equal(runtime.config.timeoutMs, 1000);
});

test('loadProviderCtor throws for unknown provider name', async () => {
  await assert.rejects(() => loadProviderCtor('unknown-provider'), AixSDKError);
});
