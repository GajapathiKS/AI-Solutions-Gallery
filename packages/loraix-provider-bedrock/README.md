# Loraix Bedrock Provider (`loraix-provider-bedrock`)

Amazon Bedrock provider adapter for `loraix-runtime-core` using the **AWS Bedrock Runtime SDK** (`Converse` + `ConverseStream`).

## Install

```bash
npm install loraix-runtime-core loraix-provider-bedrock @aws-sdk/client-bedrock-runtime
```

## Usage

```js
import { LoraixRuntime } from 'loraix-runtime-core';
import { BedrockProvider } from 'loraix-provider-bedrock';

const ai = new LoraixRuntime({
  provider: new BedrockProvider({
    region: process.env.AWS_REGION,
    // credentials are optional if provided by the default AWS credential chain (SigV4)
  }),
  // modelId or inference profile ID supported by Bedrock
  model: 'anthropic.claude-3-5-sonnet-20240620-v1:0'
});
```

## Notes

- Authentication is AWS **SigV4** via the SDK (no API key).
- Works with Bedrock model IDs and inference profile IDs through AWS SDK.
- Supports basic text messages (`system`/`user`/`assistant`) and streaming text deltas.
