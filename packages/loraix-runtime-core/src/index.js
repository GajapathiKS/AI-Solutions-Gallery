const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);

function defaultRetryStrategy(attempt, error, config) {
  if (!shouldRetry(error)) {
    return null;
  }

  const baseDelayMs = config?.retryStrategy?.baseDelayMs ?? 300;
  return baseDelayMs * (2 ** (attempt - 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function now() {
  return Date.now();
}

function toMessages(input) {
  if (typeof input === 'string') {
    return [{ role: 'user', content: input }];
  }

  if (input && Array.isArray(input.messages)) {
    return input.messages;
  }

  throw new LoraixRuntimeError('Invalid input. Expected prompt string or { messages }.');
}

function mergeCallOptions(input, options = {}) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const {
      messages: _messages,
      ...inputOptions
    } = input;

    return {
      ...inputOptions,
      ...options
    };
  }

  return options;
}

function shouldRetry(error) {
  if (!error) {
    return false;
  }

  if (error instanceof LoraixJsonValidationError) {
    return false;
  }

  const status = error.status ?? error.statusCode;
  if (typeof status === 'number') {
    if (status === 400 || status === 401 || status === 403) {
      return false;
    }
    return RETRYABLE_STATUS_CODES.has(status);
  }

  if (error.name === 'AbortError') {
    return true;
  }

  if (error.code && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code)) {
    return true;
  }

  return Boolean(error.network || error.timeout);
}

function shallowValidateSchema(json, schema) {
  if (!schema || typeof schema !== 'object') {
    return true;
  }

  for (const [key, expected] of Object.entries(schema)) {
    const value = json?.[key];
    if (expected === 'array') {
      if (!Array.isArray(value)) {
        return false;
      }
      continue;
    }

    if (expected === 'object') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
      }
      continue;
    }

    if (typeof value !== expected) {
      return false;
    }
  }

  return true;
}

function createTimeoutError(timeoutMs) {
  const err = new Error(`Timed out after ${timeoutMs}ms`);
  err.timeout = true;
  return err;
}

function withTimeout(promise, timeoutMs, { onTimeout } = {}) {
  if (!timeoutMs) {
    return promise;
  }

  let timeoutId;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const err = createTimeoutError(timeoutMs);
        onTimeout?.(err);
        reject(err);
      }, timeoutMs);
    })
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function withStreamTimeout(iterable, timeoutMs, { onTimeout } = {}) {
  if (!timeoutMs) {
    return iterable;
  }

  const iterator = iterable[Symbol.asyncIterator]();
  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        let timeoutId;
        const nextValue = await Promise.race([
          iterator.next(),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              const err = createTimeoutError(timeoutMs);
              onTimeout?.(err, iterator);
              reject(err);
            }, timeoutMs);
          })
        ]).finally(() => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        });

        if (nextValue.done) {
          return;
        }

        yield nextValue.value;
      }
    }
  };
}

export class LoraixRuntimeError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LoraixRuntimeError';
    Object.assign(this, options);
  }
}

export class LoraixJsonValidationError extends LoraixRuntimeError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'LoraixJsonValidationError';
  }
}

export class LoraixRuntime {
  constructor(config) {
    if (!config?.provider) {
      throw new LoraixRuntimeError('A provider is required.');
    }
    if (!config?.model) {
      throw new LoraixRuntimeError('A model is required.');
    }

    this.config = {
      temperature: 0,
      maxRetries: 2,
      fallbackProviders: [],
      interceptors: {
        request: [],
        attempt: [],
        response: []
      },
      ...config
    };

    this.config.interceptors = {
      request: config?.interceptors?.request ?? [],
      attempt: config?.interceptors?.attempt ?? [],
      response: config?.interceptors?.response ?? []
    };
  }

  async generate(input, options = {}) {
    const mergedOptions = mergeCallOptions(input, options);
    const messages = toMessages(input);
    const req = {
      messages,
      model: mergedOptions.model ?? this.config.model,
      temperature: mergedOptions.temperature ?? this.config.temperature,
      maxTokens: mergedOptions.maxTokens ?? this.config.maxTokens
    };

    for (const fn of this.config.interceptors.request) {
      await fn(req);
    }

    return this.#runWithProviders(req, mergedOptions);
  }

  async json({ prompt, messages, schema, ...options }) {
    const baseMessages = messages ?? toMessages(prompt);
    const enforcedMessages = [
      ...baseMessages,
      {
        role: 'system',
        content: 'Respond ONLY with strict JSON. No markdown, prose, or code fences.'
      }
    ];

    let lastErr;
    for (let i = 0; i < 2; i += 1) {
      const response = await this.generate({ messages: enforcedMessages }, options);
      try {
        const parsed = JSON.parse(response.text);
        if (!shallowValidateSchema(parsed, schema)) {
          throw new LoraixJsonValidationError('JSON does not match provided schema.');
        }

        return {
          ...response,
          json: parsed
        };
      } catch (error) {
        lastErr = error;
      }
    }

    throw new LoraixJsonValidationError('Unable to produce valid JSON output.', {
      cause: lastErr
    });
  }

  async *stream(input, options = {}) {
    const mergedOptions = mergeCallOptions(input, options);
    const messages = toMessages(input);
    const req = {
      messages,
      model: mergedOptions.model ?? this.config.model,
      temperature: mergedOptions.temperature ?? this.config.temperature,
      maxTokens: mergedOptions.maxTokens ?? this.config.maxTokens
    };

    const provider = mergedOptions.provider ?? this.config.provider;
    if (!provider?.stream) {
      throw new LoraixRuntimeError(`Provider ${provider?.name ?? 'unknown'} does not support streaming.`);
    }

    for (const fn of this.config.interceptors.request) {
      await fn(req);
    }

    let streamConn;
    let streamController;
    const timeoutMs = mergedOptions.timeoutMs ?? this.config.timeoutMs;
    await this.#retry(async ({ attempt }) => {
      streamController = new AbortController();
      streamConn = await withTimeout(
        provider.stream(req, { timeoutMs, attempt, signal: streamController.signal }),
        timeoutMs,
        {
          onTimeout: () => {
            streamController.abort();
          }
        }
      );
    }, mergedOptions);

    const timedStream = withStreamTimeout(streamConn, timeoutMs, {
      onTimeout: (_err, iterator) => {
        streamController?.abort();
        if (typeof iterator?.return === 'function') {
          iterator.return();
        }
      }
    });

    for await (const chunk of timedStream) {
      yield chunk;
    }
  }

  async #runWithProviders(req, options) {
    const providers = [options.provider ?? this.config.provider, ...(options.fallbackProviders ?? this.config.fallbackProviders)];
    const start = now();
    let totalAttempts = 0;
    let lastError;

    for (let pIdx = 0; pIdx < providers.length; pIdx += 1) {
      const provider = providers[pIdx];
      try {
        const out = await this.#retry(async ({ attempt }) => {
          const controller = new AbortController();
          totalAttempts += 1;
          for (const fn of this.config.interceptors.attempt) {
            await fn({ provider: provider.name, attempt, request: req });
          }

          return withTimeout(
            provider.generate(req, {
              timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
              attempt,
              signal: controller.signal
            }),
            options.timeoutMs ?? this.config.timeoutMs,
            {
              onTimeout: () => {
                controller.abort();
              }
            }
          );
        }, options);

        const response = {
          text: out.text,
          provider: provider.name,
          model: req.model,
          usage: out.usage,
          latencyMs: now() - start,
          attempts: totalAttempts,
          fallbackUsed: pIdx > 0,
          raw: out.raw ?? out
        };

        for (const fn of this.config.interceptors.response) {
          await fn(response);
        }

        return response;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new LoraixRuntimeError('Execution failed with no provider error.');
  }

  async #retry(operation, options) {
    const maxRetries = options.maxRetries ?? this.config.maxRetries;
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt += 1;
      try {
        return await operation({ attempt });
      } catch (error) {
        if (attempt > maxRetries || !shouldRetry(error)) {
          throw error;
        }

        const delayMs = (this.config.retryStrategy?.computeDelay ?? defaultRetryStrategy)(attempt, error, this.config);
        if (delayMs != null && delayMs > 0) {
          await sleep(delayMs);
        }
      }
    }

    throw new LoraixRuntimeError('Retry loop exhausted unexpectedly.');
  }
}

export function createRuntime(config) {
  return new LoraixRuntime(config);
}

export async function generate(input, options, config) {
  if (!config) {
    throw new LoraixRuntimeError('generate() functional API requires a config as third argument.');
  }

  const runtime = new LoraixRuntime(config);
  return runtime.generate(input, options);
}

