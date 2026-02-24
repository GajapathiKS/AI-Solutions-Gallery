# Loraix DeepSeek Provider (`loraix-provider-deepseek`)

DeepSeek provider adapter for `loraix-runtime-core` using the OpenAI-compatible chat completions API.

## Install

```bash
npm install loraix-runtime-core loraix-provider-deepseek
```

## Usage

```js
import { LoraixRuntime } from 'loraix-runtime-core';
import { DeepSeekProvider } from 'loraix-provider-deepseek';

const ai = new LoraixRuntime({
  provider: new DeepSeekProvider({ apiKey: process.env.DEEPSEEK_API_KEY }),
  model: 'deepseek-chat'
});
```
