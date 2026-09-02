import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { shell } from "electron";

const SKILL_ROOTS = [
  ".casleo/skills",
  ".agents/skills",
  ".tether/skills",
  ".cursor/skills",
  ".cursor/skills-cursor",
] as const;

export interface LocalSkillEntry {
  name: string;
  path: string;
}

export interface LocalPluginEntry {
  name: string;
  description?: string;
  path?: string;
}

function expandHome(value: string): string {
  const home = process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || os.homedir();
  return value.replace(/^~(?=\/|$)/, home);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function listLocalSkills(projectRoot?: string): Promise<LocalSkillEntry[]> {
  const home = process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || os.homedir();
  const roots = SKILL_ROOTS.map((root) => path.join(home, root));
  if (projectRoot) {
    for (const root of [".agents/skills", ".pi/skills"] as const) {
      roots.push(path.join(projectRoot, root));
    }
  }
  const skills = new Map<string, string>();
  for (const root of roots) {
    let entries;
    try {
      entries = await fsp.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      if (!(await pathExists(path.join(dir, "SKILL.md")))) continue;
      if (!skills.has(entry.name)) skills.set(entry.name, dir);
    }
  }
  return [...skills.entries()]
    .map(([name, skillPath]) => ({ name, path: skillPath }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const PLUGIN_ROOTS = [
  ".casleo/plugins",
  ".agents/plugins",
  ".pi/plugins",
  ".cursor/plugins",
  ".tether/plugins",
] as const;

export async function listLocalPlugins(projectRoot?: string): Promise<LocalPluginEntry[]> {
  const home = process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || os.homedir();
  const roots = PLUGIN_ROOTS.map((root) => path.join(home, root));
  if (projectRoot) {
    for (const root of PLUGIN_ROOTS) roots.push(path.join(projectRoot, root));
  }
  const plugins = new Map<string, LocalPluginEntry>();
  for (const root of roots) {
    let entries;
    try {
      entries = await fsp.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      let name = entry.name;
      let description: string | undefined;
      for (const manifestName of ["plugin.json", "package.json"]) {
        try {
          const manifest = JSON.parse(await fsp.readFile(path.join(dir, manifestName), "utf8")) as Record<string, unknown>;
          if (typeof manifest.name === "string" && manifest.name.trim()) name = manifest.name.trim();
          if (typeof manifest.description === "string" && manifest.description.trim()) description = manifest.description.trim();
          break;
        } catch {
          // A directory name is a valid fallback for lightweight plugins.
        }
      }
      if (!plugins.has(name)) plugins.set(name, { name, ...(description ? { description } : {}), path: dir });
    }
  }
  return [...plugins.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveSkillRevealPath(skillName: string, hint?: string): Promise<string> {
  const normalized = skillName.trim();
  if (!normalized) throw new Error("Invalid skill name");

  const hints = hint?.trim()
    ? [expandHome(hint.trim()), path.join(expandHome(hint.trim()), "SKILL.md")]
    : [];
  for (const candidate of hints) {
    if (await pathExists(candidate)) return candidate;
  }

  const local = await listLocalSkills();
  const match = local.find((item) => item.name === normalized);
  if (match) return path.join(match.path, "SKILL.md");

  throw new Error(`找不到 skill「${normalized}」的目录`);
}

export async function revealSkillPath(skillName: string, hint?: string): Promise<void> {
  const resolved = await resolveSkillRevealPath(skillName, hint);
  const stat = await fsp.stat(resolved);
  if (stat.isDirectory()) {
    const err = await shell.openPath(resolved);
    if (err) throw new Error(err);
    return;
  }
  shell.showItemInFolder(resolved);
}


