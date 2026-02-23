# LoraixRuntime SDK (`loraix-runtime-sdk`)

LoraixRuntime is a modular, provider-agnostic AI execution runtime.

## Features

- Unified execution pipeline
- Provider injection via adapter interface
- Retry + fallback
- JSON mode with shallow schema validation
- Streaming abstraction
- Request/attempt/response interceptors

## Install

```bash
npm install loraix-runtime-sdk
```

## Quick start

```js
import { LoraixRuntime, OpenAIProvider } from 'loraix-runtime-sdk';

const ai = new LoraixRuntime({
  provider: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }),
  model: 'gpt-4o-mini',
  maxRetries: 2
});

const result = await ai.generate('Explain recursion in one paragraph.');
console.log(result.text);
```

## JSON mode

```js
const structured = await ai.json({
  prompt: 'Return a user profile.',
  schema: {
    name: 'string',
    age: 'number'
  }
});

console.log(structured.json);
```

## Streaming

```js
for await (const chunk of ai.stream('Tell me a short story.')) {
  process.stdout.write(chunk);
}
```
