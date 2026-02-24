import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

class LoraixProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LoraixProviderError';
    Object.assign(this, options);
  }
}

function toBedrockMessages(messages = []) {
  return messages
    .filter((message) => message?.role === 'user' || message?.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: [{ text: String(message.content ?? '') }]
    }));
}

function toBedrockSystem(messages = []) {
  const systemText = messages
    .filter((message) => message?.role === 'system')
    .map((message) => String(message.content ?? ''))
    .join('\n');

  if (!systemText) {
    return undefined;
  }

  return [{ text: systemText }];
}

function normalizeOutputText(outputMessage) {
  if (!outputMessage?.content || !Array.isArray(outputMessage.content)) {
    return '';
  }

  return outputMessage.content
    .map((item) => (typeof item?.text === 'string' ? item.text : ''))
    .join('');
}

export class BedrockProvider {
  constructor({
    apiKey,
    region,
    credentials,
    endpoint,
    bedrockClient
  } = {}) {
    if (apiKey) {
      throw new LoraixProviderError('BedrockProvider does not use apiKey. Use AWS SigV4 credentials (default chain or credentials option).');
    }

    if (bedrockClient) {
      this.client = bedrockClient;
    } else {
      if (!region) {
        throw new LoraixProviderError('BedrockProvider requires region when bedrockClient is not provided.');
      }

      this.client = new BedrockRuntimeClient({
        region,
        credentials,
        endpoint
      });
    }

    this.name = 'bedrock';
  }

  async generate(request, ctx = {}) {
    const command = new ConverseCommand({
      modelId: request.model,
      messages: toBedrockMessages(request.messages),
      system: toBedrockSystem(request.messages),
      inferenceConfig: {
        temperature: request.temperature,
        maxTokens: request.maxTokens
      }
    });

    let data;
    try {
      data = await this.client.send(command, { abortSignal: ctx.signal });
    } catch (error) {
      throw new LoraixProviderError(`Bedrock request failed: ${error?.message ?? 'Unknown error'}`, { raw: error });
    }

    return {
      text: normalizeOutputText(data?.output?.message),
      usage: {
        promptTokens: data?.usage?.inputTokens,
        completionTokens: data?.usage?.outputTokens,
        totalTokens: data?.usage?.totalTokens
      },
      raw: data
    };
  }

  async stream(request, ctx = {}) {
    const command = new ConverseStreamCommand({
      modelId: request.model,
      messages: toBedrockMessages(request.messages),
      system: toBedrockSystem(request.messages),
      inferenceConfig: {
        temperature: request.temperature,
        maxTokens: request.maxTokens
      }
    });

    let response;
    try {
      response = await this.client.send(command, { abortSignal: ctx.signal });
    } catch (error) {
      throw new LoraixProviderError(`Bedrock stream request failed: ${error?.message ?? 'Unknown error'}`, { raw: error });
    }

    return {
      async *[Symbol.asyncIterator]() {
        for await (const event of response?.stream ?? []) {
          const delta = event?.contentBlockDelta?.delta?.text;
          if (typeof delta === 'string' && delta.length > 0) {
            yield delta;
          }
        }
      }
    };
  }
}
