// src/core/schema.ts
export type ActionType =
  | "navigate"
  | "type"
  | "click"
  | "press"
  | "selectOption"
  | "hover"
  | "drag"
  | "waitFor"
  | "screenshot"
  | "resize";

export interface PlanStep {
  /** One of the supported action types */
  type: ActionType;
  /** CSS/XPath/text; interpreted by executor per tool */
  target?: string;
  /** Value for typing / url for navigate / file name for screenshot / etc */
  value?: string;
  /** Optional timeout override for this step */
  timeoutMs?: number;
}

export type VerifyType = "text" | "visible" | "url" | "exists" | "scroll" | "screenshot";

export interface VerifyStep {
  type: VerifyType;
  target?: string; // selector or "document" for url
  value?: string;  // expected text or substring of URL
  timeoutMs?: number;
}

export interface AgentPlan {
  steps: PlanStep[];
  verification: VerifyStep[];
  artifacts?: { screenshots?: string[] };
}
