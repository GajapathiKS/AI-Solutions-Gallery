class LoraixProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LoraixProviderError';
    Object.assign(this, options);
  }
}

export class DeepSeekProvider {
  constructor({ apiKey, baseUrl = 'https://api.deepseek.com/v1', fetchImpl = globalThis.fetch }) {
    if (!apiKey) {
      throw new LoraixProviderError('DeepSeekProvider requires apiKey.');
    }
    if (!fetchImpl) {
      throw new LoraixProviderError('DeepSeekProvider requires fetch implementation.');
    }

    this.name = 'deepseek';
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
  }

  async generate(request, ctx = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`
      },
      signal: ctx.signal,
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens
      })
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new LoraixProviderError(`DeepSeek request failed (${response.status}): ${errBody}`, { status: response.status, raw: errBody });
    }

    const data = await response.json();
    return {
      text: data?.choices?.[0]?.message?.content ?? '',
      usage: {
        promptTokens: data?.usage?.prompt_tokens,
        completionTokens: data?.usage?.completion_tokens,
        totalTokens: data?.usage?.total_tokens
      },
      raw: data
    };
  }

  async stream(request, ctx = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`
      },
      signal: ctx.signal,
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true
      })
    });

    if (!response.ok) {
      throw new LoraixProviderError(`DeepSeek stream request failed (${response.status})`, { status: response.status });
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
            if (payload === '[DONE]') {
              return;
            }

            try {
              const json = JSON.parse(payload);
              const delta = json?.choices?.[0]?.delta?.content;
              if (delta) {
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
