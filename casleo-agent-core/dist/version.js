import fs from "node:fs";
const metadata = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
if (typeof metadata.version !== "string" || metadata.version.length === 0) {
    throw new Error("Casleo Runtime package version is missing");
}
export const CASLEO_VERSION = metadata.version;
//# sourceMappingURL=version.js.map