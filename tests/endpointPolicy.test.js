import test from 'node:test';
import assert from 'node:assert/strict';

import { isEndpointAllowed } from '../src/index.js';

test('isEndpointAllowed allows any endpoint when no allowlist is provided', () => {
  assert.equal(isEndpointAllowed('https://example.com/v1/chat', []), true);
  assert.equal(isEndpointAllowed('https://example.com/v1/chat'), true);
});

test('isEndpointAllowed enforces prefix checks', () => {
  const allowlist = ['https://api.example.com/', 'https://proxy.internal/v1/'];
  assert.equal(isEndpointAllowed('https://api.example.com/v1/chat/completions', allowlist), true);
  assert.equal(isEndpointAllowed('https://proxy.internal/v1/chat', allowlist), true);
  assert.equal(isEndpointAllowed('https://malicious.example.net/v1/chat', allowlist), false);
});
