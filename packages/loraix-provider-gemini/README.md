# Loraix Gemini Provider (`loraix-provider-gemini`)

Google Gemini provider adapter for `loraix-runtime-core` using Google AI `generateContent` and `streamGenerateContent` APIs.

## Install

```bash
npm install loraix-runtime-core loraix-provider-gemini
```

## Usage

```js
import { LoraixRuntime } from 'loraix-runtime-core';
import { GeminiProvider } from 'loraix-provider-gemini';

const ai = new LoraixRuntime({
  provider: new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY }),
  model: 'gemini-1.5-flash'
});
```

## Docs

See the repository docs portal for cross-package architecture and launch guidance: `../../docs/index.html`.
