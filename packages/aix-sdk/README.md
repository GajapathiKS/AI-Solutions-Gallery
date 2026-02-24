# Aix SDK (`aix-sdk`)

Unified SDK facade for `loraix-runtime-core` and Loraix providers.

## Install

```bash
npm install aix-sdk loraix-runtime-core loraix-provider-openai
```

Add whichever providers you use:

```bash
npm install loraix-provider-anthropic loraix-provider-bedrock loraix-provider-gemini loraix-provider-azure-openai
```

## Usage

```js
import { createAixClient } from 'aix-sdk';

const ai = await createAixClient({
  provider: 'openai',
  providerOptions: { apiKey: process.env.OPENAI_API_KEY },
  model: 'gpt-4o-mini'
});

const response = await ai.generate({
  prompt: 'Say hello'
});
```

## Docs

See the repository docs portal for cross-package architecture and launch guidance: `../../docs/index.html`.
