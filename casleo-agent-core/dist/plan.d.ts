import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
export declare const PLAN_STATE_ENTRY = "tether-plan-state";
declare const planStepSchema: Type.TObject<{
    step: Type.TString;
    status: Type.TUnion<[Type.TLiteral<"pending">, Type.TLiteral<"in_progress">, Type.TLiteral<"completed">]>;
}>;
export type PlanStep = Static<typeof planStepSchema>;
export interface PlanState {
    explanation?: string;
    steps: PlanStep[];
    revision: number;
    updatedAt: string;
}
export declare function registerPlanTool(pi: ExtensionAPI, getPlan: () => PlanState | undefined, onUpdate: (plan: PlanState, ctx: ExtensionContext) => void): void;
export declare function restorePlanState(entries: SessionEntry[]): PlanState | undefined;
export declare function planWidgetLines(state: PlanState | undefined, ctx: ExtensionContext): string[] | undefined;
export declare function formatPlanForExecution(state: PlanState): string;
export declare function validatePlanSteps(steps: PlanStep[]): string | undefined;
export {};
