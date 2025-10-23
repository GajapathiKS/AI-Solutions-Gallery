import { z } from 'zod';

export const StepActionSchema = z.enum([
  'navigate',
  'type',
  'click',
  'waitFor',
  'expectText',
  'expectVisible',
  'screenshot',
  'planNote'
]);

export const PlanStepSchema = z.object({
  action: StepActionSchema,
  description: z.string().optional(),
  url: z.string().optional(),
  target: z.string().optional(),
  value: z.string().optional(),
  text: z.string().optional(),
  expect: z.string().optional(),
  waitFor: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  screenshotName: z.string().optional()
});

export const VerificationSchema = z.object({
  type: z.enum(['text', 'visible', 'url']),
  target: z.string(),
  value: z.string().optional(),
  timeoutMs: z.number().int().positive().optional()
});

export const PlanSchema = z.object({
  plan: z.array(PlanStepSchema),
  verification: z.array(VerificationSchema).optional(),
  notes: z.string().optional()
});

export type PlanStep = z.infer<typeof PlanStepSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
export type PlanPayload = z.infer<typeof PlanSchema>;

export interface AgentPlan {
  steps: PlanStep[];
  verification: Verification[];
  notes?: string;
}

export function normalisePlan(payload: PlanPayload): AgentPlan {
  return {
    steps: payload.plan,
    verification: payload.verification ?? [],
    notes: payload.notes
  };
}
