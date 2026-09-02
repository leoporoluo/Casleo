import fs from "node:fs";
const metadata = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
if (typeof metadata.version !== "string" || metadata.version.length === 0) {
    throw new Error("Tether Runtime package version is missing");
}
export const TETHER_VERSION = metadata.version;
//# sourceMappingURL=version.js.map