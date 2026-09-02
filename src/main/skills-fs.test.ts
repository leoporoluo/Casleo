import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listLocalPlugins, listLocalSkills, resolveSkillRevealPath } from "./skills-fs";

describe("skills-fs", () => {
  const home = path.join(os.tmpdir(), `casleo-skills-test-${process.pid}`);
  const skillRoot = path.join(home, ".agents/skills/demo-skill");

  afterEach(async () => {
    await fsp.rm(home, { recursive: true, force: true });
  });

  it("finds skills under ~/.agents/skills", async () => {
    await fsp.mkdir(skillRoot, { recursive: true });
    await fsp.writeFile(path.join(skillRoot, "SKILL.md"), "# demo\n");

    const original = process.env.HOME;
    process.env.HOME = home;
    try {
      expect(await listLocalSkills()).toEqual([{ name: "demo-skill", path: skillRoot }]);
      await expect(resolveSkillRevealPath("demo-skill")).resolves.toBe(path.join(skillRoot, "SKILL.md"));
    } finally {
      process.env.HOME = original;
    }
  });

  it("finds plugins under Pi project and user roots", async () => {
    const projectRoot = path.join(home, "project");
    const projectPlugin = path.join(projectRoot, ".pi/plugins/project-plugin");
    const userPlugin = path.join(home, ".agents/plugins/user-plugin");
    await fsp.mkdir(projectPlugin, { recursive: true });
    await fsp.mkdir(userPlugin, { recursive: true });
    await fsp.writeFile(path.join(projectPlugin, "plugin.json"), JSON.stringify({ name: "Project plugin" }));

    const original = process.env.HOME;
    process.env.HOME = home;
    try {
      expect(await listLocalPlugins(projectRoot)).toEqual([
        { name: "Project plugin", path: projectPlugin },
        { name: "user-plugin", path: userPlugin },
      ]);
    } finally {
      process.env.HOME = original;
    }
  });
});

