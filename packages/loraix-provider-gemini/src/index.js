class LoraixProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LoraixProviderError';
    Object.assign(this, options);
  }
}

function toGeminiContents(messages = []) {
  return messages
    .filter((message) => message?.role === 'user' || message?.role === 'assistant')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(message.content ?? '') }]
    }));
}

function toGeminiSystemInstruction(messages = []) {
  const text = messages
    .filter((message) => message?.role === 'system')
    .map((message) => String(message.content ?? ''))
    .join('\n');

  if (!text) return undefined;
  return { parts: [{ text }] };
}

function normalizeGeminiText(data) {
  const candidates = data?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return '';
  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';

  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('');
}

export class GeminiProvider {
  constructor({ apiKey, baseUrl = 'https://generativelanguage.googleapis.com/v1beta', fetchImpl = globalThis.fetch }) {
    if (!apiKey) {
      throw new LoraixProviderError('GeminiProvider requires apiKey.');
    }
    if (!fetchImpl) {
      throw new LoraixProviderError('GeminiProvider requires fetch implementation.');
    }

    this.name = 'gemini';
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  async generate(request, ctx = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}/models/${request.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctx.signal,
      body: JSON.stringify({
        contents: toGeminiContents(request.messages),
        systemInstruction: toGeminiSystemInstruction(request.messages),
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens
        }
      })
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new LoraixProviderError(`Gemini request failed (${response.status}): ${errBody}`, { status: response.status, raw: errBody });
    }

    const data = await response.json();
    return {
      text: normalizeGeminiText(data),
      usage: {
        promptTokens: data?.usageMetadata?.promptTokenCount,
        completionTokens: data?.usageMetadata?.candidatesTokenCount,
        totalTokens: data?.usageMetadata?.totalTokenCount
      },
      raw: data
    };
  }

  async stream(request, ctx = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}/models/${request.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctx.signal,
      body: JSON.stringify({
        contents: toGeminiContents(request.messages),
        systemInstruction: toGeminiSystemInstruction(request.messages),
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens
        }
      })
    });

    if (!response.ok) {
      throw new LoraixProviderError(`Gemini stream request failed (${response.status})`, { status: response.status });
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

            try {
              const data = JSON.parse(payload);
              const text = normalizeGeminiText(data);
              if (text) yield text;
            } catch {
              // ignore malformed chunks
            }
          }
        }
      }
    };
  }
}
