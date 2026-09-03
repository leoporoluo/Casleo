import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
export async function capturePatchCheckpoint(workspace, patchInput, apply) {
    const touched = extractTouchedPaths(patchInput);
    const before = await snapshotPaths(workspace, touched);
    await apply();
    const after = await snapshotPaths(workspace, touched);
    return {
        id: crypto.randomUUID().slice(0, 12),
        createdAt: new Date().toISOString(),
        patch: patchInput,
        before,
        after,
    };
}
export async function captureWorkspaceCheckpoint(workspace, label, apply) {
    const before = await scanWorkspace(workspace);
    const result = await apply();
    const after = await scanWorkspace(workspace);
    const files = [...new Set([...before.keys(), ...after.keys()])].sort();
    const changed = files.filter((file) => before.get(file)?.hash !== after.get(file)?.hash);
    if (changed.length === 0)
        return { result };
    const beforeSnapshots = changed.map((file) => before.get(file) ?? missingSnapshot(file));
    const afterSnapshots = changed.map((file) => after.get(file) ?? missingSnapshot(file));
    return {
        result,
        checkpoint: {
            id: crypto.randomUUID().slice(0, 12),
            createdAt: new Date().toISOString(),
            patch: `exec_command: ${label}`,
            before: beforeSnapshots,
            after: afterSnapshots,
        },
    };
}
export async function restoreCheckpoint(workspace, checkpoint, force = false) {
    const current = await snapshotPaths(workspace, checkpoint.after.map((snapshot) => snapshot.path));
    const conflicts = current
        .filter((snapshot, index) => snapshot.hash !== checkpoint.after[index]?.hash)
        .map((snapshot) => snapshot.path);
    if (conflicts.length > 0 && !force) {
        throw new Error(`Cannot undo because these files changed after the checkpoint: ${conflicts.join(", ")}`);
    }
    for (const snapshot of checkpoint.before) {
        const absolute = await workspace.resolve(snapshot.path, true);
        if (snapshot.content === null) {
            await fs.rm(absolute, { force: true });
            continue;
        }
        await fs.mkdir(path.dirname(absolute), { recursive: true });
        const temporary = path.join(path.dirname(absolute), `.${path.basename(absolute)}.casleo-undo-${process.pid}-${Date.now()}.tmp`);
        try {
            await fs.writeFile(temporary, snapshot.content, {
                encoding: "utf8",
                ...(snapshot.mode === undefined ? {} : { mode: snapshot.mode }),
            });
            await fs.rename(temporary, absolute);
        }
        catch (error) {
            await fs.rm(temporary, { force: true });
            throw error;
        }
    }
    return checkpoint.before.map((snapshot) => snapshot.path);
}
export function extractTouchedPaths(input) {
    const paths = [];
    for (const line of input.replaceAll("\r\n", "\n").split("\n")) {
        const match = /^\*\*\* (?:Add File|Delete File|Update File|Move to): (.+)$/.exec(line);
        if (!match)
            continue;
        const file = match[1].trim();
        if (file && !paths.includes(file))
            paths.push(file);
    }
    if (paths.length === 0)
        throw new Error("Patch contains no file paths");
    return paths;
}
async function snapshotPaths(workspace, files) {
    const snapshots = [];
    for (const file of files) {
        const absolute = await workspace.resolve(file, true);
        try {
            const stat = await fs.stat(absolute);
            if (!stat.isFile())
                throw new Error(`Checkpoint path is not a regular file: ${file}`);
            const content = await fs.readFile(absolute, "utf8");
            snapshots.push({
                path: file,
                content,
                mode: stat.mode,
                hash: hash(content),
            });
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
            snapshots.push({ path: file, content: null, hash: hash(null) });
        }
    }
    return snapshots;
}
async function scanWorkspace(workspace) {
    await workspace.initialize();
    const snapshots = new Map();
    await scanDirectory(workspace, ".", snapshots);
    return snapshots;
}
async function scanDirectory(workspace, relativeDirectory, snapshots) {
    if (snapshots.size > 2_000)
        return;
    const absoluteDirectory = await workspace.resolve(relativeDirectory, true);
    let entries;
    try {
        entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith(".") && entry.name !== ".agents")
            continue;
        if (["node_modules", "dist", "dist-electron", "release", "coverage"].includes(entry.name))
            continue;
        const relative = relativeDirectory === "." ? entry.name : path.join(relativeDirectory, entry.name);
        if (entry.isDirectory()) {
            await scanDirectory(workspace, relative, snapshots);
            continue;
        }
        if (!entry.isFile())
            continue;
        const absolute = await workspace.resolve(relative, true);
        const stat = await fs.stat(absolute);
        if (stat.size > 1_000_000)
            continue;
        const content = await readTextFile(absolute);
        if (content === undefined)
            continue;
        snapshots.set(relative, {
            path: relative,
            content,
            mode: stat.mode,
            hash: hash(content),
        });
    }
}
async function readTextFile(file) {
    const buffer = await fs.readFile(file);
    if (buffer.includes(0))
        return undefined;
    return buffer.toString("utf8");
}
function missingSnapshot(file) {
    return { path: file, content: null, hash: hash(null) };
}
function hash(content) {
    return crypto.createHash("sha256").update(content === null ? "\0missing" : content).digest("hex");
}
//# sourceMappingURL=checkpoint.js.map