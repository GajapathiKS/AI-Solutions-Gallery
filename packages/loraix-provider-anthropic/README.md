# Loraix Anthropic Provider (`loraix-provider-anthropic`)

Anthropic Claude provider adapter for `loraix-runtime-core`.

## Install

```bash
npm install loraix-runtime-core loraix-provider-anthropic
```

## Usage

```js
import { LoraixRuntime } from 'loraix-runtime-core';
import { AnthropicProvider } from 'loraix-provider-anthropic';

const ai = new LoraixRuntime({
  provider: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),
  model: 'claude-3-5-sonnet-latest'
});
```
