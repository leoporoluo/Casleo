import fsp from "node:fs/promises";
import path from "node:path";

export function npmPackageName(source: string): string | undefined {
  const spec = source.trim().replace(/^npm:/, "");
  const match = spec.match(/^(@[^/]+\/[^@/]+|[^@/]+)(?:@.+)?$/);
  return match?.[1];
}

function npmPackagePath(root: string, source: string): string | undefined {
  const packageName = npmPackageName(source);
  if (!packageName) return undefined;

  const packageRoot = path.resolve(root);
  const target = path.resolve(packageRoot, packageName);
  const relative = path.relative(packageRoot, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Package path is outside the Pi npm directory");
  }
  return target;
}

export async function removeNpmPackage(root: string, source: string): Promise<void> {
  const packageName = npmPackageName(source);
  const target = npmPackagePath(root, source);
  if (!target || !packageName) return;
  await fsp.rm(target, { recursive: true, force: true });

  const manifestPath = path.join(path.dirname(path.resolve(root)), "package.json");
  try {
    const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8")) as Record<string, unknown>;
    let changed = false;
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
      const dependencies = manifest[field];
      if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) continue;
      if (packageName in dependencies) {
        delete (dependencies as Record<string, unknown>)[packageName];
        changed = true;
      }
    }
    if (changed) await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
