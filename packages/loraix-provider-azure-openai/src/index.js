class LoraixProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LoraixProviderError';
    Object.assign(this, options);
  }
}

export class AzureOpenAIProvider {
  constructor({ apiKey, resourceName, apiVersion = '2024-10-21', deployment, baseUrl, fetchImpl = globalThis.fetch }) {
    if (!apiKey) throw new LoraixProviderError('AzureOpenAIProvider requires apiKey.');
    if (!fetchImpl) throw new LoraixProviderError('AzureOpenAIProvider requires fetch implementation.');
    if (!deployment) throw new LoraixProviderError('AzureOpenAIProvider requires deployment.');

    this.name = 'azure-openai';
    this.apiKey = apiKey;
    this.apiVersion = apiVersion;
    this.deployment = deployment;
    this.baseUrl = baseUrl ? baseUrl.replace(/\/+$/, '') : `https://${resourceName}.openai.azure.com`;

    if (!this.baseUrl || !this.baseUrl.startsWith('http')) {
      throw new LoraixProviderError('AzureOpenAIProvider requires a valid baseUrl or resourceName.');
    }

    this.fetchImpl = fetchImpl;
  }

  buildUrl(path) {
    return `${this.baseUrl}/openai/deployments/${this.deployment}${path}?api-version=${encodeURIComponent(this.apiVersion)}`;
  }

  async generate(request, ctx = {}) {
    const response = await this.fetchImpl(this.buildUrl('/chat/completions'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'api-key': this.apiKey
      },
      signal: ctx.signal,
      body: JSON.stringify({
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens
      })
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new LoraixProviderError(`Azure OpenAI request failed (${response.status}): ${errBody}`, { status: response.status, raw: errBody });
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
    const response = await this.fetchImpl(this.buildUrl('/chat/completions'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'api-key': this.apiKey
      },
      signal: ctx.signal,
      body: JSON.stringify({
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true
      })
    });

    if (!response.ok) {
      throw new LoraixProviderError(`Azure OpenAI stream request failed (${response.status})`, { status: response.status });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    return {
      async *[Symbol.asyncIterator]() {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            if (!part.startsWith('data:')) continue;
            const payload = part.slice(5).trim();
            if (!payload) continue;
            if (payload === '[DONE]') return;

            try {
              const json = JSON.parse(payload);
              const delta = json?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length > 0) yield delta;
            } catch {
              // ignore malformed chunks
            }
          }
        }
      }
    };
  }
}
