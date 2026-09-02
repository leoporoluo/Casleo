import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

// Pi 0.84.4 exposes the model context as a constant. Keep the desktop setting
// effective without forking the runtime package: the worker reads this value
// from its environment when it starts.
const require = createRequire(import.meta.url);
let settingsPath;
try {
  settingsPath = path.join(path.dirname(require.resolve("casleo-agent-core")), "settings.js");
} catch {
  process.exit(0);
}

const source = await fs.readFile(settingsPath, "utf8");
const target = 'const configuredContextWindow = Number.parseInt(process.env.CASLEO_CONTEXT_WINDOW ?? "", 10);\nexport const DEEPSEEK_CONTEXT_WINDOW = Number.isFinite(configuredContextWindow) && configuredContextWindow > 0\n    ? configuredContextWindow\n    : 272_000;';
const updated = source.replace(
  /export const DEEPSEEK_CONTEXT_WINDOW = [^;]+;/,
  target,
);
if (updated !== source) await fs.writeFile(settingsPath, updated);
