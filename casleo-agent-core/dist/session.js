import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getCasleoSessionsDir } from "./home.js";
export class SessionStore {
    workspace;
    model;
    file;
    constructor(workspace, model) {
        this.workspace = workspace;
        this.model = model;
        const id = crypto.createHash("sha256").update(workspace).digest("hex").slice(0, 20);
        this.file = path.join(getCasleoSessionsDir(), `${id}.json`);
    }
    async load() {
        try {
            const raw = await fs.readFile(this.file, "utf8");
            const parsed = JSON.parse(raw);
            if (parsed.version !== 1 ||
                parsed.workspace !== this.workspace ||
                parsed.model !== this.model ||
                !Array.isArray(parsed.messages)) {
                return [];
            }
            return parsed.messages;
        }
        catch (error) {
            if (error.code === "ENOENT") {
                return [];
            }
            throw new Error(`Could not load session ${this.file}: ${error.message}`);
        }
    }
    async save(messages) {
        const session = {
            version: 1,
            workspace: this.workspace,
            model: this.model,
            updatedAt: new Date().toISOString(),
            messages,
        };
        await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
        const temporary = `${this.file}.${process.pid}.tmp`;
        await fs.writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
        await fs.rename(temporary, this.file);
    }
    async clear() {
        await fs.rm(this.file, { force: true });
    }
}
//# sourceMappingURL=session.js.map