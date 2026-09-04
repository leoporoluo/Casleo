import fsp from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { removeNpmPackage } from "./package-fs";

describe("package-fs", () => {
  const root = path.join(process.cwd(), ".tmp-package-fs-test");

  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  it("deletes an npm package within the Pi package root", async () => {
    const packageRoot = path.join(root, "node_modules");
    const packagePath = path.join(packageRoot, "@scope", "demo");
    await fsp.mkdir(root, { recursive: true });
    await fsp.writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { "@scope/demo": "1.0.0" } }));
    await fsp.mkdir(packagePath, { recursive: true });
    await fsp.writeFile(path.join(packagePath, "package.json"), "{}\n");

    await removeNpmPackage(packageRoot, "npm:@scope/demo@1.0.0");

    await expect(fsp.access(packagePath)).rejects.toThrow();
    await expect(fsp.readFile(path.join(root, "package.json"), "utf8")).resolves.toBe("{\n  \"dependencies\": {}\n}\n");
  });

  it("does not remove the package root for non-npm sources", async () => {
    await fsp.mkdir(root, { recursive: true });
    await fsp.writeFile(path.join(root, "package.json"), "{}\n");

    await removeNpmPackage(root, "https://example.com/package.tgz");

    await expect(fsp.access(root)).resolves.toBeUndefined();
  });
});
