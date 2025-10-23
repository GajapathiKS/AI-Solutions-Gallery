// Same file you showed (keep the path/import style)
// Replaces the fetch-based implementation with BedrockRuntimeClient.

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
} from "@aws-sdk/client-bedrock-runtime";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { HttpRequest } from "@smithy/protocol-http";
import type { BuildHandlerOptions } from "@smithy/types";
import { RunLogger } from "../core/logger.js";

export interface BedrockRequestOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

function createBedrockClient(logger: RunLogger) {
  // Prefer a region that actually hosts nova-lite; fallback to your env.
  const region = process.env.AWS_REGION || "us-east-1";
  const model = process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";

  // Accept API key from any of these envs; treat your existing var as an API key.
  const apiKey =
    process.env.BEDROCK_API_KEY ||
    process.env.AWS_BEDROCK_API_KEY ||
    process.env.AWS_BEARER_TOKEN_BEDROCK;

  // Print the token exactly as requested (⚠️ risky in shared envs).
  if (apiKey) {
    console.log("[DEBUG] BEDROCK API KEY (full):", apiKey);
    const masked =
      apiKey.length > 12 ? `${apiKey.slice(0, 6)}...${apiKey.slice(-6)}` : apiKey;
    console.log("[DEBUG] BEDROCK API KEY (masked):", masked);
  } else {
    console.warn(
      "[WARN] No API key found in BEDROCK_API_KEY / AWS_BEDROCK_API_KEY / AWS_BEARER_TOKEN_BEDROCK."
    );
  }

  const client = new BedrockRuntimeClient({
    region,
    // If you decide to use SigV4 (IAM keys/SSO/role), defaultProvider() will pick them up.
    credentials: defaultProvider(),
  });

  // If API key present, inject it as x-api-key (Bedrock does NOT use Authorization: Bearer ...)
  if (apiKey) {
    const addApiKeyHeader = (next: any) => async (args: any) => {
      const req = args.request as HttpRequest;
      req.headers = { ...(req.headers || {}), "x-api-key": apiKey! };
      return next(args);
    };
    client.middlewareStack.add(addApiKeyHeader, {
      step: "build",
      name: "addApiKeyHeaderMiddleware",
    } as BuildHandlerOptions);
  }

  // Friendly note if region is commonly problematic for nova-lite.
  if (["eu-north-1"].includes(region)) {
    logger.warn(
      `AWS_REGION="${region}" may not host "${model}". Prefer "us-east-1" or "us-west-2".`
    );
  }

  return client;
}

export async function askBedrock(
  options: BedrockRequestOptions,
  logger: RunLogger
): Promise<string> {
  const region = process.env.AWS_REGION || "us-east-1";
  const model = process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";

  // Keep a concise config print (token already printed above)
  console.log("Bedrock config", {
    region,
    model,
    tokenEnv:
      process.env.BEDROCK_API_KEY
        ? "BEDROCK_API_KEY"
        : process.env.AWS_BEDROCK_API_KEY
        ? "AWS_BEDROCK_API_KEY"
        : process.env.AWS_BEARER_TOKEN_BEDROCK
        ? "AWS_BEARER_TOKEN_BEDROCK"
        : "none",
  });

  const client = createBedrockClient(logger);

  const input: ConverseCommandInput = {
    modelId: model,
    system: [{ text: options.systemPrompt }],
    messages: [
      {
        role: "user",
        content: [{ text: options.userPrompt }],
      },
    ],
    inferenceConfig: {
      temperature: options.temperature ?? 0.2,
      maxTokens: options.maxTokens ?? 1200,
    },
  };

  logger.debug("Calling Bedrock (Converse)", { region, model });

  try {
    const res = await client.send(new ConverseCommand(input));

    // Extract first text block from the response
    const text =
      res?.output?.message?.content?.find(
        (c: any) => c && typeof c.text === "string"
      )?.text ?? null;

    if (!text) {
      logger.error("Unexpected Bedrock payload", { payload: res });
      throw new Error("Bedrock response did not include text content");
    }

    logger.debug("Received Bedrock response", { preview: text.slice(0, 200) });
    return text;
  } catch (err: any) {
    const code = err?.$metadata?.httpStatusCode
      ? `HTTP ${err.$metadata.httpStatusCode}`
      : "";
    const name = err?.name || "Error";
    const msg = typeof err?.message === "string" ? err.message : String(err);

    const tips =
      "\nTroubleshooting:\n" +
      "- We send x-api-key if any of BEDROCK_API_KEY / AWS_BEDROCK_API_KEY / AWS_BEARER_TOKEN_BEDROCK is set.\n" +
      "- If you prefer SigV4, unset API key envs and set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY (and AWS_SESSION_TOKEN if temp creds).\n" +
      `- Verify AWS_REGION (${region}) actually hosts ${model} (try us-east-1 or us-west-2).`;

    throw new Error(`Bedrock request failed -> ${name} ${code}: ${msg}${tips}`);
  }
}