import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_PROVIDER_PRESETS } from '../src/index.js';

test('default provider presets include major configured providers', () => {
  const ids = new Set(DEFAULT_PROVIDER_PRESETS.map((preset) => preset.id));

  [
    'openai-official',
    'azure-openai',
    'ollama-local',
    'gemini-openai-compatible',
    'groq-llama-free',
    'deepseek-chat',
    'claude-proxy',
    'amazon-bedrock-proxy',
    'sarvam-proxy'
  ].forEach((id) => {
    assert.equal(ids.has(id), true, `missing preset: ${id}`);
  });
});
