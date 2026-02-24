# Loraix Azure OpenAI Provider (`loraix-provider-azure-openai`)

Azure OpenAI provider adapter for `loraix-runtime-core`, using deployment-based chat completions.

## Install

```bash
npm install loraix-runtime-core loraix-provider-azure-openai
```

## Usage

```js
import { LoraixRuntime } from 'loraix-runtime-core';
import { AzureOpenAIProvider } from 'loraix-provider-azure-openai';

const ai = new LoraixRuntime({
  provider: new AzureOpenAIProvider({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    resourceName: process.env.AZURE_OPENAI_RESOURCE,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    apiVersion: '2024-10-21'
  }),
  model: 'ignored-by-azure-deployment'
});
```
