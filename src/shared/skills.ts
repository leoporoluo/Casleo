/** Project-relative dirs scanned by Pi when the workspace is trusted. */
export const PROJECT_SKILL_ROOTS = [".pi/skills", ".agents/skills"] as const;

/** User-global dirs (always available; not listed in workspace @ picker). */
export const USER_SKILL_ROOTS = ["~/.pi/agent/skills", "~/.agents/skills"] as const;

/** Extension roots mirror Pi's project/user layout. */
export const PROJECT_PLUGIN_ROOTS = [".pi/extensions"] as const;
export const USER_PLUGIN_ROOTS = ["~/.pi/agent/extensions"] as const;

/** Pi installs package sources under these directories; settings.json controls loading. */
export const PROJECT_PACKAGE_ROOTS = [".pi/npm", ".pi/git"] as const;
export const USER_PACKAGE_ROOTS = ["~/.pi/agent/npm", "~/.pi/agent/git"] as const;

export interface AgentSkillCommand {
  name: string;
  description?: string;
  /** Skill root dir or SKILL.md path from agent sourceInfo. */
  path?: string;
  enabled?: boolean;
}

export type AgentCommandSource = "extension" | "skill";

export interface AgentSlashCommand {
  name: string;
  description?: string;
  source: AgentCommandSource;
  path?: string;
  enabled?: boolean;
}

export function skillSlashCommand(name: string): string {
  const bare = name.startsWith("skill:") ? name.slice("skill:".length) : name.replace(/^\//, "");
  return `/skill:${bare}`;
}

export function agentSlashCommand(command: Pick<AgentSlashCommand, "name" | "source">): string {
  return command.source === "skill" ? skillSlashCommand(command.name) : `/${command.name.replace(/^\/+/, "")}`;
}

export function parseAgentCommands(
  commands: Array<{
    name: string;
    description?: string;
    source?: string;
    sourceInfo?: { path?: string; baseDir?: string; source?: string; origin?: string };
  }>,
): AgentSlashCommand[] {
  const result: AgentSlashCommand[] = [];
  const packageCommands: AgentSlashCommand[] = [];
  for (const command of commands) {
    if (command.source !== "extension" && command.source !== "skill") continue;
    if (command.source === "extension" && command.sourceInfo?.source !== undefined
      && command.sourceInfo.source !== "local" && command.sourceInfo.origin !== "package") continue;
    const rawName = command.name.replace(/^\/+/, "");
    const name = command.source === "skill" && rawName.startsWith("skill:")
      ? rawName.slice("skill:".length)
      : rawName;
    if (!name) continue;
    const path = command.sourceInfo?.path ?? command.sourceInfo?.baseDir;
    const parsed: AgentSlashCommand = {
      name,
      source: command.source,
      ...(command.description ? { description: command.description } : {}),
      ...(path ? { path } : {}),
    };
    if (command.source === "extension" && command.sourceInfo?.origin === "package") packageCommands.push(parsed);
    else result.push(parsed);
  }
  return [...packageCommands, ...result];
}

export function parseSkillCommands(
  commands: Array<{
    name: string;
    description?: string;
    source?: string;
    sourceInfo?: { path?: string; baseDir?: string };
  }>,
): AgentSkillCommand[] {
  const skills: AgentSkillCommand[] = [];
  for (const command of commands) {
    if (command.source !== "skill") continue;
    const name = command.name.startsWith("skill:") ? command.name.slice("skill:".length) : command.name;
    if (!name) continue;
    const skillPath = command.sourceInfo?.path ?? command.sourceInfo?.baseDir;
    skills.push({
      name,
      description: command.description,
      ...(skillPath ? { path: skillPath } : {}),
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

const SKILL_BLOCK_RE = /^<skill name="([^"]+)"[^>]*>[\s\S]*?<\/skill>(?:\n\n([\s\S]+))?$/;

/** Collapse stored `/skill:` or expanded `<skill>` user turns to a short label. */
export function skillUserDisplay(text: string): { command: string; args?: string } | undefined {
  const trimmed = text.trim();
  const slash = trimmed.match(/^\/skill:([^\s]+)(?:\s+([\s\S]+))?$/);
  if (slash) {
    return { command: `/skill:${slash[1]}`, args: slash[2]?.trim() || undefined };
  }
  const block = trimmed.match(SKILL_BLOCK_RE);
  if (block) {
    return { command: `/skill:${block[1]}`, args: block[2]?.trim() || undefined };
  }
  return undefined;
}

export function sameUserSkillTurn(a: string, b: string): boolean {
  if (a === b) return true;
  const left = skillUserDisplay(a);
  const right = skillUserDisplay(b);
  return Boolean(left && right && left.command === right.command);
}

