# Loraix Grok Provider (`loraix-provider-grok`)

Grok (xAI) provider adapter for `loraix-runtime-core` using the OpenAI-compatible chat completions API.

## Install

```bash
npm install loraix-runtime-core loraix-provider-grok
```

## Usage

```js
import { LoraixRuntime } from 'loraix-runtime-core';
import { GrokProvider } from 'loraix-provider-grok';

const ai = new LoraixRuntime({
  provider: new GrokProvider({ apiKey: process.env.XAI_API_KEY }),
  model: 'grok-2-latest'
});
```
