import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_UI_CONFIG, DEFAULT_BRANDING } from '../src/index.js';

test('default UI config exposes theme and density', () => {
  assert.equal(DEFAULT_UI_CONFIG.theme, 'default');
  assert.equal(DEFAULT_UI_CONFIG.density, 'comfortable');
});

test('default branding remains available', () => {
  assert.equal(typeof DEFAULT_BRANDING.title, 'string');
  assert.equal(typeof DEFAULT_BRANDING.configButtonLabel, 'string');
});
