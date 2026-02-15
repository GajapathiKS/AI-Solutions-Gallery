import test from 'node:test';
import assert from 'node:assert/strict';

import { VoiceAssistPlugin } from '../src/index.js';

test('readRuntimeConfigFromForm clears providerPreset when Custom is selected', () => {
  const fakePlugin = {
    aiConfig: { providerPreset: 'ollama-local', endpoint: 'https://api.example.com/v1/chat' },
    adminConfig: {
      providerPresets: [
        { id: 'ollama-local', config: { endpoint: 'http://localhost:11434/v1/chat/completions' } }
      ],
      allowedEndpoints: ['https://api.example.com/', 'http://localhost:11434/']
    },
    getEditableRuntimeFields: () => ['providerPreset', 'endpoint', 'model', 'systemPrompt'],
    assertAllowedEndpoint: VoiceAssistPlugin.prototype.assertAllowedEndpoint
  };

  const formData = new FormData();
  formData.set('providerPreset', '');
  formData.set('endpoint', 'https://api.example.com/v1/chat');

  const parsed = VoiceAssistPlugin.prototype.readRuntimeConfigFromForm.call(fakePlugin, formData);

  assert.equal(parsed.providerPreset, '');
});

test('readPersistedRuntimeConfig ignores tampered endpoint outside allowlist', () => {
  const originalWindow = global.window;
  const store = new Map();
  store.set(
    'test-storage-key',
    JSON.stringify({ endpoint: 'https://evil.example.com/v1/chat', model: 'x' })
  );

  global.window = {
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: () => {}
    }
  };

  const fakePlugin = {
    adminConfig: {
      persistRuntimeConfig: true,
      storageKey: 'test-storage-key',
      allowedEndpoints: ['https://api.example.com/']
    },
    getEditableRuntimeFields: () => ['endpoint', 'model'],
    assertAllowedEndpoint: VoiceAssistPlugin.prototype.assertAllowedEndpoint
  };

  const parsed = VoiceAssistPlugin.prototype.readPersistedRuntimeConfig.call(fakePlugin);
  assert.deepEqual(parsed, {});

  if (originalWindow === undefined) {
    delete global.window;
  } else {
    global.window = originalWindow;
  }
});
