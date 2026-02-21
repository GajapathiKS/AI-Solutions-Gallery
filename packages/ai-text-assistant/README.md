# AI Text Assistant Plugin (Standalone Package)

A framework-agnostic plugin for adding AI-assisted writing and voice features to any web app.

## Features

- Speech-to-text for focused text fields.
- AI prompt actions (fix grammar, summarize, expand, etc.).
- Selection tools:
  - Read selected text aloud.
  - Summarize selected text.
  - Grammar-check selected text.
  - Works from a floating popup when selecting text anywhere on a webpage.
- Admin-governed runtime config (safe for reusable multi-tenant usage).

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

## LLM provider support

This plugin is **LLM stack agnostic**. Out of the box it supports OpenAI-compatible workflows and can be connected to many providers:

- OpenAI
- Azure OpenAI
- Ollama
- Gemini (OpenAI-compatible endpoint)
- Groq
- DeepSeek
- Claude (recommended through your proxy)
- Amazon Bedrock (recommended through your proxy)
- Sarvam AI (recommended through your proxy)

Why “proxy recommended” for some providers?
- Some vendors use non-OpenAI schemas/auth flows.
- You can normalize provider-specific formats using either:
  - `aiConfig.buildPayload` + `aiConfig.transformResponse`, or
  - full custom `aiRequest`.

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


## Selection popup actions

Selecting text anywhere in the webpage (headings, paragraphs, cards, articles, not just textboxes) shows a compact floating toolbar near the selection with:
- Read aloud
- Grammar check
- Summarize

This works even outside focused text inputs for quick comprehension workflows.
