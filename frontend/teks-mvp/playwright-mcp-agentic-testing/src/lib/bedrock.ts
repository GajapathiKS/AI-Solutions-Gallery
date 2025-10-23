import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
} from "@aws-sdk/client-bedrock-runtime";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { HttpRequest } from "@smithy/protocol-http";
import { BuildHandlerOptions } from "@smithy/types";

const REGION = process.env.AWS_REGION || "us-east-1";
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";

// Accept API Key via either of these env names:
const API_KEY =
  process.env.BEDROCK_API_KEY ||
  process.env.AWS_BEDROCK_API_KEY ||
  process.env.AWS_BEARER_TOKEN_BEDROCK; // legacy var you used — we’ll treat it as an API key

/**
 * Create a Bedrock client that supports:
 *  - SigV4 (defaultProvider / normal AWS creds)
 *  - x-api-key header if an API key is provided
 */
export function createBedrockClient() {
  const client = new BedrockRuntimeClient({
    region: REGION,
    // If the process has AWS creds (env/SSO/role), defaultProvider will pick them up.
    credentials: defaultProvider(),
  });

  // If user provided an API key, inject it as x-api-key (not a Bearer token)
  if (API_KEY) {
    const addApiKeyHeader = (next: any, _context: any) => async (args: any) => {
      const req = args.request as HttpRequest;
      req.headers = {
        ...(req.headers || {}),
        "x-api-key": API_KEY!,
      };
      return next(args);
    };
    client.middlewareStack.add(addApiKeyHeader, {
      step: "build",
      name: "addApiKeyHeaderMiddleware",
    } as BuildHandlerOptions);
  }

  return client;
}

/**
 * Simple text invocation helper for nova-lite using InvokeModel.
 * If you’re using the Converse API elsewhere, you can adapt similarly.
 */
export async function invokeText(prompt: string) {
  const client = createBedrockClient();

  // Safety check to catch the common “wrong region for model” pitfall early:
  const unsupportedRegionsForNovaLite = new Set([
    "eu-north-1", // your current one
    // add more if you know them
  ]);
  if (unsupportedRegionsForNovaLite.has(REGION)) {
    throw new Error(
      `BEDROCK: The region "${REGION}" is unlikely to host "${MODEL_ID}". Try AWS_REGION=us-east-1 or us-west-2.`
    );
  }

  const payload = {
    inputText: prompt,
    // You can pass additional config here as the model expects.
  };

  const input: InvokeModelCommandInput = {
    modelId: MODEL_ID,
    body: JSON.stringify(payload),
    contentType: "application/json",
    accept: "application/json",
  };

  try {
    const res = await client.send(new InvokeModelCommand(input));
    const text = Buffer.from(res.body as Uint8Array).toString("utf-8");
    return JSON.parse(text);
  } catch (err: any) {
    // Normalize and improve error messages
    const raw = err?.$metadata
      ? `HTTP ${err.$metadata.httpStatusCode} ${err.name || ""}`
      : `${err?.name || "Error"}`;
    const details =
      typeof err?.message === "string" ? `: ${err.message}` : "";

    // Common advice
    const tips =
      `\n\nTroubleshooting:\n` +
      `- If you’re using API key auth, set BEDROCK_API_KEY (or AWS_BEDROCK_API_KEY) and NOT a Bearer token.\n` +
      `- If you’re using SigV4, ensure AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (and AWS_SESSION_TOKEN if needed) are set and valid.\n` +
      `- Verify AWS_REGION is a region that hosts ${MODEL_ID} (try us-east-1 or us-west-2).`;

    throw new Error(`Bedrock invocation failed -> ${raw}${details}${tips}`);
  }
}
