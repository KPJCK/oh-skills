// src/shared/next-action.ts
import type { OhEnv, AgentRole, Host } from "../env";
import { resolveAgent, detectHost } from "../env";

export type AgentDispatchAction = {
  type: "dispatch_agent";
  agent: string;
  role: AgentRole;
  prompt: string;
};

export type SelfActAction = {
  type: "self_act";
  role: AgentRole;
  prompt: string;
};

export type NextAction =
  | { type: "invoke_skill"; skill: string; instructions: string }
  | AgentDispatchAction
  | SelfActAction
  | { type: "ask_user"; question: string; options?: readonly string[] }
  | { type: "report"; message: string };

export type Skill = "nice" | "context" | "search" | "doctor" | "help" | "init" | "bug-tracing";

const SENTINELS: Record<Skill, string> = {
  nice: "__OH_NICE_NEXT_ACTIONS__",
  context: "__OH_CONTEXT_NEXT_ACTIONS__",
  search: "__OH_SEARCH_NEXT_ACTIONS__",
  doctor: "__OH_DOCTOR_NEXT_ACTIONS__",
  help: "__OH_HELP_NEXT_ACTIONS__",
  init: "__OH_INIT_NEXT_ACTIONS__",
  "bug-tracing": "__OH_BUG_TRACING_NEXT_ACTIONS__",
};

export { SENTINELS };

export function emit(skill: Skill, actions: readonly NextAction[]): void {
  process.stderr.write(`\n${SENTINELS[skill]}${JSON.stringify(actions)}\n`);
}

export function buildAgentAction(opts: {
  role: AgentRole;
  env: OhEnv;
  dispatchedPrompt: string;
  selfActPrompt: string;
  host?: Host;
}): AgentDispatchAction | SelfActAction {
  const agent = resolveAgent(opts.role, opts.env, opts.host ?? detectHost());
  if (agent) {
    return {
      type: "dispatch_agent",
      agent,
      role: opts.role,
      prompt: opts.dispatchedPrompt,
    };
  }
  return {
    type: "self_act",
    role: opts.role,
    prompt: opts.selfActPrompt,
  };
}
