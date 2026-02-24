class LoraixProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LoraixProviderError';
    Object.assign(this, options);
  }
}

function normalizeAnthropicText(content) {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((item) => item?.type === 'text' && typeof item?.text === 'string')
    .map((item) => item.text)
    .join('');
}

function toAnthropicMessages(messages) {
  return (messages ?? [])
    .filter((m) => m?.role === 'user' || m?.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));
}

function toSystemPrompt(messages) {
  return (messages ?? [])
    .filter((m) => m?.role === 'system')
    .map((m) => m.content)
    .join('\n');
}

export class AnthropicProvider {
  constructor({ apiKey, baseUrl = 'https://api.anthropic.com/v1', anthropicVersion = '2023-06-01', fetchImpl = globalThis.fetch }) {
    if (!apiKey) {
      throw new LoraixProviderError('AnthropicProvider requires apiKey.');
    }
    if (!fetchImpl) {
      throw new LoraixProviderError('AnthropicProvider requires fetch implementation.');
    }

    this.name = 'anthropic';
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.anthropicVersion = anthropicVersion;
    this.fetchImpl = fetchImpl;
  }

  async generate(request, ctx = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.anthropicVersion
      },
      signal: ctx.signal,
      body: JSON.stringify({
        model: request.model,
        messages: toAnthropicMessages(request.messages),
        system: toSystemPrompt(request.messages) || undefined,
        temperature: request.temperature,
        max_tokens: request.maxTokens ?? 1024
      })
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new LoraixProviderError(`Anthropic request failed (${response.status}): ${errBody}`, { status: response.status, raw: errBody });
    }

    const data = await response.json();
    return {
      text: normalizeAnthropicText(data?.content),
      usage: {
        promptTokens: data?.usage?.input_tokens,
        completionTokens: data?.usage?.output_tokens,
        totalTokens: (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0)
      },
      raw: data
    };
  }

  async stream(request, ctx = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.anthropicVersion
      },
      signal: ctx.signal,
      body: JSON.stringify({
        model: request.model,
        messages: toAnthropicMessages(request.messages),
        system: toSystemPrompt(request.messages) || undefined,
        temperature: request.temperature,
        max_tokens: request.maxTokens ?? 1024,
        stream: true
      })
    });

    if (!response.ok) {
      throw new LoraixProviderError(`Anthropic stream request failed (${response.status})`, { status: response.status });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    return {
      async *[Symbol.asyncIterator]() {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            if (!part.startsWith('data:')) {
              continue;
            }

            const payload = part.slice(5).trim();
            if (!payload) {
              continue;
            }

            try {
              const event = JSON.parse(payload);
              const delta = event?.delta?.text;
              if (typeof delta === 'string' && delta.length > 0) {
                yield delta;
              }
            } catch {
              // ignore malformed chunks
            }
          }
        }
      }
    };
  }
}
