import { RunLogger } from '../core/logger.js';

export interface BedrockRequestOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export async function askBedrock(
  options: BedrockRequestOptions,
  logger: RunLogger
): Promise<string> {
  const fetchFn = globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('Global fetch is not available in this Node runtime. Upgrade to Node 18+ or polyfill fetch.');
  }
  const region = process.env.AWS_REGION || 'eu-north-1';
  const model = process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0';
  const token = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!token) {
    throw new Error('AWS_BEARER_TOKEN_BEDROCK is required to query Bedrock');
  }
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${model}/converse`;
  const body = {
    system: [{ text: options.systemPrompt }],
    messages: [
      {
        role: 'user',
        content: [{ text: options.userPrompt }]
      }
    ],
    inferenceConfig: {
      temperature: options.temperature ?? 0.2,
      maxTokens: options.maxTokens ?? 1200
    }
  };
  logger.debug('Calling Bedrock', { url, model });
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bedrock request failed with ${response.status}: ${text}`);
  }
  const payload = (await response.json()) as any;
  const content = payload?.output?.message?.content?.[0]?.text;
  if (typeof content !== 'string') {
    logger.error('Unexpected Bedrock payload', { payload });
    throw new Error('Bedrock response did not include text content');
  }
  logger.debug('Received Bedrock response', { preview: content.slice(0, 200) });
  return content;
}
