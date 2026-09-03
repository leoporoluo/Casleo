import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deleteResource, listLocalPlugins, listLocalSkills, resolveSkillRevealPath, setResourceEnabled } from "./skills-fs";

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
    const projectPlugin = path.join(projectRoot, ".pi/extensions/project-plugin");
    const userPlugin = path.join(home, ".pi/agent/extensions/user-plugin.ts");
    await fsp.mkdir(projectPlugin, { recursive: true });
    await fsp.mkdir(path.dirname(userPlugin), { recursive: true });
    await fsp.writeFile(path.join(projectPlugin, "index.ts"), "export default () => {}\n");
    await fsp.writeFile(userPlugin, "export default () => {}\n");

    const original = process.env.HOME;
    process.env.HOME = home;
    try {
      expect(await listLocalPlugins(projectRoot)).toEqual([
        { name: "project-plugin", path: projectPlugin },
        { name: "user-plugin", path: userPlugin },
      ]);
    } finally {
      process.env.HOME = original;
    }
  });

  it("disables and restores a skill through its Pi manifest", async () => {
    await fsp.mkdir(skillRoot, { recursive: true });
    await fsp.writeFile(path.join(skillRoot, "SKILL.md"), "# demo\n");
    const original = process.env.HOME;
    process.env.HOME = home;
    try {
      await setResourceEnabled("skill", skillRoot, false);
      expect(await listLocalSkills()).toEqual([{ name: "demo-skill", path: skillRoot, enabled: false }]);
      await setResourceEnabled("skill", skillRoot, true);
      expect(await listLocalSkills()).toEqual([{ name: "demo-skill", path: skillRoot }]);
    } finally {
      process.env.HOME = original;
    }
  });

  it("disables and deletes an extension only inside Pi roots", async () => {
    const extension = path.join(home, ".pi/agent/extensions/demo.ts");
    await fsp.mkdir(path.dirname(extension), { recursive: true });
    await fsp.writeFile(extension, "export default () => {}\n");
    const original = process.env.HOME;
    process.env.HOME = home;
    try {
      await setResourceEnabled("extension", extension, false);
      const disabled = `${extension}.disabled`;
      expect(await listLocalPlugins()).toEqual([{ name: "demo", path: disabled, enabled: false }]);
      await deleteResource("extension", disabled);
      expect(await listLocalPlugins()).toEqual([]);
      await expect(deleteResource("extension", path.join(home, "outside.ts"))).rejects.toThrow("Pi 标准目录");
    } finally {
      process.env.HOME = original;
    }
  });
});

