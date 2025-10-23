// src/core/bedrockClient.ts
/**
 * Minimal Bedrock (Nova Lite) JSON helper using Bearer token.
 * Env:
 *  - AWS_REGION
 *  - BEDROCK_MODEL_ID (e.g. "amazon.nova-lite-v1:0")
 *  - AWS_BEARER_TOKEN_BEDROCK
 */
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

export interface BedrockClientOptions {
  region?: string;
  modelId?: string;
  bearerToken?: string;
  baseUrl?: string;           // override service base URL
  authHeader?: "authorization" | "x-api-key"; // header to carry token
}

export class BedrockClient {
  private readonly region: string;
  private readonly modelId: string;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly authHeader: "authorization" | "x-api-key";
  private readonly useAwsSdk: boolean;

  constructor(opts: BedrockClientOptions = {}) {
    this.region = opts.region || process.env.AWS_REGION || "us-east-1";
    this.modelId = opts.modelId || process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";
    // accept multiple common env var names
    this.token =
      opts.bearerToken ||
      process.env.AWS_BEARER_TOKEN_BEDROCK ||
      process.env.BEDROCK_API_KEY ||
      process.env.AWS_BEDROCK_API_KEY ||
      process.env.AWS_BEARER_TOKEN ||
      "";
    this.baseUrl = opts.baseUrl || process.env.BEDROCK_BASE_URL || `https://bedrock-runtime.${this.region}.amazonaws.com`;
    const wantXApi = (opts.authHeader === "x-api-key") || process.env.BEDROCK_AUTH_HEADER === "x-api-key" || process.env.AWS_BEDROCK_USE_X_API_KEY === "1";
    this.authHeader = wantXApi ? "x-api-key" : "authorization";
    
    // Detect placeholder AWS credentials (common pattern: "REPLACE_ME" or short/invalid keys)
    const accessKey = process.env.AWS_ACCESS_KEY_ID || "";
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY || "";
    const isPlaceholder = 
      !accessKey || 
      !secretKey || 
      accessKey === "REPLACE_ME" || 
      secretKey === "REPLACE_ME" ||
      accessKey.length < 16 ||
      secretKey.length < 32;
    
    // Use AWS SDK only if credentials are real and no bearer token is explicitly provided
    this.useAwsSdk = Boolean(
      !isPlaceholder &&
      !this.token &&
      (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_PROFILE)
    );
    
    if (!this.useAwsSdk && !this.token) {
      throw new Error("AWS_BEARER_TOKEN_BEDROCK (or valid AWS credentials) is required");
    }
  }

  /** Ask model to return JSON (we validate outside with zod if needed). */
  async generateJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    // Build legacy text payload (Nova Lite v1 text mode)
    const textBody = {
      inputText: `${systemPrompt}\n\nUSER:\n${userPrompt}\n\nReturn ONLY strict JSON.`,
      textGenerationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxTokenCount: 2000,
      },
    };

    // Prefer AWS SDK (SigV4) when AWS credentials are valid
    if (this.useAwsSdk) {
      const client = new BedrockRuntimeClient({ region: this.region });
      const cmd = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: "application/json",
        accept: "application/json",
        body: Buffer.from(JSON.stringify(textBody)),
      });
      const res = await client.send(cmd);
      const text = new TextDecoder().decode(res.body as Uint8Array);
      const payload = JSON.parse(text) as any;
      const raw =
        payload?.output?.message?.content?.[0]?.text ??
        payload?.output?.text ??
        payload?.generated_text ??
        payload?.content?.[0]?.text ??
        "";
      try {
        return JSON.parse(raw) as T;
      } catch {
        const m = String(raw).match(/\{[\s\S]*\}$/);
        if (!m) throw new Error("Bedrock returned non-JSON content");
        return JSON.parse(m[0]) as T;
      }
    }

    // Fallback to bearer/x-api-key fetch mode (for bearer tokens / proxies)
    // Use /converse endpoint with messages payload (Nova Lite bearer tokens expect this)
    const converseBody = {
      system: [{ text: systemPrompt }],
      messages: [{ role: "user", content: [{ text: `${userPrompt}\n\nReturn ONLY strict JSON.` }] }],
      inferenceConfig: { temperature: 0.2, maxTokens: 2000 },
    };
    const url = `${this.baseUrl.replace(/\/$/, "")}/model/${encodeURIComponent(this.modelId)}/converse`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...(this.authHeader === "authorization"
          ? { "Authorization": `Bearer ${this.token}` }
          : { "x-api-key": this.token }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(converseBody),
    });    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Bedrock error ${res.status}: ${t}`);
    }

    const payload = await res.json() as any;
    // Extract text from /converse response shape
    let raw = payload?.output?.message?.content?.[0]?.text ?? "";
    if (!raw) {
      throw new Error(`Bedrock /converse returned unexpected shape: ${JSON.stringify(payload)}`);
    }
    
    // Strip markdown code fences if present (```json ... ```)
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/,"").trim();
    
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Attempt to extract JSON block from remaining prose
      const m = String(raw).match(/\{[\s\S]*\}$/);
      if (!m) throw new Error(`Bedrock returned non-JSON content: ${raw.substring(0, 200)}`);
      return JSON.parse(m[0]) as T;
    }
  }

  /** Ask model to return plain text (no JSON parsing). */
  async generateText(systemPrompt: string, userPrompt: string): Promise<string> {
    // Build legacy text payload (Nova Lite v1 text mode)
    const textBody = {
      inputText: `${systemPrompt}\n\nUSER:\n${userPrompt}`,
      textGenerationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxTokenCount: 4000,
      },
    };

    // Prefer AWS SDK (SigV4) when AWS credentials are valid
    if (this.useAwsSdk) {
      const client = new BedrockRuntimeClient({ region: this.region });
      const cmd = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: "application/json",
        accept: "application/json",
        body: Buffer.from(JSON.stringify(textBody)),
      });
      const res = await client.send(cmd);
      const text = new TextDecoder().decode(res.body as Uint8Array);
      const payload = JSON.parse(text) as any;
      return (
        payload?.output?.message?.content?.[0]?.text ??
        payload?.output?.text ??
        payload?.generated_text ??
        payload?.content?.[0]?.text ??
        ""
      );
    }

    // Fallback to bearer/x-api-key fetch mode (for bearer tokens / proxies)
    const converseBody = {
      system: [{ text: systemPrompt }],
      messages: [{ role: "user", content: [{ text: userPrompt }] }],
      inferenceConfig: { temperature: 0.2, maxTokens: 4000 },
    };
    const url = `${this.baseUrl.replace(/\/$/, "")}/model/${encodeURIComponent(this.modelId)}/converse`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...(this.authHeader === "authorization"
          ? { "Authorization": `Bearer ${this.token}` }
          : { "x-api-key": this.token }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(converseBody),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Bedrock error ${res.status}: ${t}`);
    }

    const payload = await res.json() as any;
    return payload?.output?.message?.content?.[0]?.text ?? "";
  }
}
