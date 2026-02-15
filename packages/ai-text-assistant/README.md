# AI Text Assistant Plugin (Standalone Package)

A framework-agnostic plugin for adding AI-assisted writing and voice features to any web app.

## Features

- Speech-to-text for focused text fields
- AI prompt actions (fix grammar, summarize, expand, etc.)
- Selection tools:
  - Read selected text aloud
  - Summarize selected text
- Admin-governed runtime config (safe for reusable multi-tenant usage)

## Install

```bash
npm install ai-text-assistant-plugin
```

## Quick usage

```js
import VoiceAssistPlugin from 'ai-text-assistant-plugin';

const plugin = new VoiceAssistPlugin({
  aiConfig: {
    endpoint: '/api/ai/chat',
    model: 'gpt-4o-mini'
  },
  adminConfig: {
    allowRuntimeConfig: true,
    editableRuntimeFields: ['providerPreset', 'endpoint', 'model', 'systemPrompt']
  }
});
```

## Works with

React, Angular, Vue, Svelte, and vanilla JS (browser environments).

## Local demo

```bash
cd packages/ai-text-assistant
python -m http.server 4173
# open http://localhost:4173/examples/basic.html
```

## Tests

```bash
cd packages/ai-text-assistant
npm test
```
