import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { casleoEnv } from "./env.js";
import { getCasleoHome } from "./home.js";
import { getCasleoStorageSettings, } from "./settings.js";
const KEYRING_SERVICE = "casleo-agent-core";
const STORE_PATCH = Symbol.for("casleo.agent.credential-store-installed");
const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 15_000;
function defaultAuthPath() {
    return path.join(getCasleoHome(), "auth.json");
}
/** Plain JSON fallback compatible with pi's existing auth.json shape. */
export class FileCredentialStore {
    authPath;
    constructor(authPath = defaultAuthPath()) {
        this.authPath = authPath;
    }
    async read(providerId) {
        return (await readCredentialData(this.authPath))[providerId];
    }
    async list() {
        const data = await readCredentialData(this.authPath);
        return Object.entries(data).map(([providerId, credential]) => ({
            providerId,
            type: credential.type,
        }));
    }
    async modify(providerId, fn) {
        return withDirectoryLock(`${this.authPath}.lock`, async () => {
            const data = await readCredentialData(this.authPath);
            const current = data[providerId];
            const next = await fn(current);
            if (next === undefined)
                return current;
            data[providerId] = next;
            await writePrivateJson(this.authPath, data);
            return next;
        });
    }
    async delete(providerId) {
        await withDirectoryLock(`${this.authPath}.lock`, async () => {
            const data = await readCredentialData(this.authPath);
            if (!(providerId in data))
                return;
            delete data[providerId];
            await writePrivateJson(this.authPath, data);
        });
    }
}
/** CredentialStore backed by Keychain, Credential Manager, or Secret Service. */
export class KeyringCredentialStore {
    factory;
    metadataPath;
    constructor(factory, metadataPath = path.join(getCasleoHome(), "credential-metadata.json")) {
        this.factory = factory;
        this.metadataPath = metadataPath;
    }
    async read(providerId) {
        const serialized = this.factory.create(KEYRING_SERVICE, providerId).getPassword();
        return serialized
            ? parseCredential(serialized, `system keyring entry for ${providerId}`)
            : undefined;
    }
    async list() {
        const metadata = await readMetadata(this.metadataPath);
        return Object.entries(metadata.providers).map(([providerId, entry]) => ({
            providerId,
            type: entry.type,
        }));
    }
    async modify(providerId, fn) {
        return withDirectoryLock(this.lockPath(providerId), async () => {
            const current = await this.read(providerId);
            const next = await fn(current);
            if (next === undefined)
                return current;
            this.factory.create(KEYRING_SERVICE, providerId).setPassword(JSON.stringify(next));
            await this.remember(providerId, next.type);
            return next;
        });
    }
    async delete(providerId) {
        await withDirectoryLock(this.lockPath(providerId), async () => {
            this.factory.create(KEYRING_SERVICE, providerId).deletePassword();
            const metadata = await readMetadata(this.metadataPath);
            if (!(providerId in metadata.providers))
                return;
            delete metadata.providers[providerId];
            await writePrivateJson(this.metadataPath, metadata);
        });
    }
    lockPath(providerId) {
        const safeProvider = providerId.replace(/[^a-zA-Z0-9_.-]/gu, "_");
        return path.join(getCasleoHome(), ".credential-locks", `${safeProvider}.lock`);
    }
    async remember(providerId, type) {
        const metadata = await readMetadata(this.metadataPath);
        metadata.providers[providerId] = { type };
        await writePrivateJson(this.metadataPath, metadata);
    }
}
class AutoCredentialStore {
    keyring;
    file;
    constructor(keyring, file) {
        this.keyring = keyring;
        this.file = file;
    }
    async migrateFileCredentials() {
        for (const { providerId } of await this.file.list()) {
            const credential = await this.file.read(providerId);
            if (!credential)
                continue;
            try {
                await this.keyring.modify(providerId, async () => credential);
                await this.file.delete(providerId);
            }
            catch {
                // auto deliberately preserves the working file credential when the OS store is unavailable.
                return;
            }
        }
    }
    async read(providerId) {
        try {
            const keyringCredential = await this.keyring.read(providerId);
            if (keyringCredential)
                return keyringCredential;
        }
        catch {
            // Fall through to the owner-only auth file.
        }
        return this.file.read(providerId);
    }
    async list() {
        const merged = new Map();
        for (const entry of await this.file.list())
            merged.set(entry.providerId, entry);
        try {
            for (const entry of await this.keyring.list())
                merged.set(entry.providerId, entry);
        }
        catch {
            // The fallback list is still authoritative when the OS service is unavailable.
        }
        return [...merged.values()];
    }
    async modify(providerId, fn) {
        const current = await this.read(providerId);
        const next = await fn(current);
        if (next === undefined)
            return current;
        try {
            const stored = await this.keyring.modify(providerId, async () => next);
            await this.file.delete(providerId);
            return stored;
        }
        catch {
            return this.file.modify(providerId, async () => next);
        }
    }
    async delete(providerId) {
        try {
            await this.keyring.delete(providerId);
        }
        catch {
            // Logout must still clear the fallback credential.
        }
        await this.file.delete(providerId);
    }
}
export async function createCasleoCredentialStore(options = {}) {
    const configured = getCasleoStorageSettings();
    const mode = options.mode ?? configured.credentialStore;
    const file = new FileCredentialStore(options.authPath ?? defaultAuthPath());
    if (mode === "file")
        return file;
    if (mode === "auto" && !options.keyringFactory && !canUseInteractiveKeyring())
        return file;
    let factory = options.keyringFactory;
    if (!factory) {
        try {
            const { Entry } = await import("@napi-rs/keyring");
            factory = { create: (service, account) => new Entry(service, account) };
        }
        catch (error) {
            if (mode === "auto")
                return file;
            throw new Error(`System keyring is unavailable: ${errorMessage(error)}`);
        }
    }
    const keyring = new KeyringCredentialStore(factory, options.metadataPath ?? path.join(getCasleoHome(), "credential-metadata.json"));
    if (mode === "keyring")
        return keyring;
    const automatic = new AutoCredentialStore(keyring, file);
    await automatic.migrateFileCredentials();
    return automatic;
}
/**
 * pi's CLI creates ModelRuntime internally. Patch its public factory once so every
 * TUI, JSON, and RPC runtime receives the same Casleo Runtime-owned credential store.
 */
export async function installCasleoCredentialStore() {
    const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
    const runtime = ModelRuntime;
    if (runtime[STORE_PATCH])
        return;
    const credentials = await createCasleoCredentialStore();
    const create = ModelRuntime.create.bind(ModelRuntime);
    ModelRuntime.create = (options = {}) => create({ ...options, credentials: options.credentials ?? credentials });
    runtime[STORE_PATCH] = true;
}
async function readCredentialData(authPath) {
    try {
        const parsed = JSON.parse(await fs.readFile(authPath, "utf8"));
        if (!isRecord(parsed))
            return {};
        return Object.fromEntries(Object.entries(parsed).filter((entry) => isCredential(entry[1])));
    }
    catch (error) {
        if (isNodeError(error) && error.code === "ENOENT")
            return {};
        if (error instanceof SyntaxError)
            throw new Error(`Cannot parse Casleo Runtime auth file: ${authPath}`);
        throw error;
    }
}
async function readMetadata(metadataPath) {
    try {
        const parsed = JSON.parse(await fs.readFile(metadataPath, "utf8"));
        if (!isRecord(parsed) || !isRecord(parsed.providers))
            return emptyMetadata();
        const providers = {};
        for (const [providerId, value] of Object.entries(parsed.providers)) {
            if (isRecord(value) && (value.type === "api_key" || value.type === "oauth")) {
                providers[providerId] = { type: value.type };
            }
        }
        return { version: 1, providers };
    }
    catch (error) {
        if (isNodeError(error) && error.code === "ENOENT")
            return emptyMetadata();
        if (error instanceof SyntaxError) {
            throw new Error(`Cannot parse Casleo Runtime credential metadata: ${metadataPath}`);
        }
        throw error;
    }
}
function emptyMetadata() {
    return { version: 1, providers: {} };
}
async function writePrivateJson(file, value) {
    const directory = path.dirname(file);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.chmod(directory, 0o700).catch(() => undefined);
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
        await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
        await fs.chmod(temporary, 0o600);
        await fs.rename(temporary, file);
        await fs.chmod(file, 0o600);
    }
    finally {
        await fs.unlink(temporary).catch(() => undefined);
    }
}
async function withDirectoryLock(lockPath, task) {
    await fs.mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (true) {
        try {
            await fs.mkdir(lockPath, { mode: 0o700 });
            break;
        }
        catch (error) {
            if (!isNodeError(error) || error.code !== "EEXIST")
                throw error;
            const stale = await fs.stat(lockPath).then((stat) => Date.now() - stat.mtimeMs > LOCK_STALE_MS, () => false);
            if (stale) {
                await fs.rmdir(lockPath).catch(() => undefined);
                continue;
            }
            if (Date.now() >= deadline)
                throw new Error(`Timed out waiting for credential lock: ${lockPath}`);
            await new Promise((resolve) => setTimeout(resolve, 75));
        }
    }
    try {
        return await task();
    }
    finally {
        await fs.rmdir(lockPath).catch(() => undefined);
    }
}
function parseCredential(serialized, source) {
    try {
        const parsed = JSON.parse(serialized);
        if (isCredential(parsed))
            return parsed;
    }
    catch {
        // Report one consistent message for invalid JSON and invalid credential shapes.
    }
    throw new Error(`Cannot parse ${source}`);
}
function isCredential(value) {
    if (!isRecord(value))
        return false;
    if (value.type === "api_key") {
        return value.key === undefined || typeof value.key === "string";
    }
    return (value.type === "oauth" &&
        typeof value.access === "string" &&
        typeof value.refresh === "string" &&
        typeof value.expires === "number");
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNodeError(error) {
    return error instanceof Error && "code" in error;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function canUseInteractiveKeyring() {
    return Boolean(process.versions.electron ||
        (process.stdin.isTTY && process.stdout.isTTY) ||
        casleoEnv("ALLOW_HEADLESS_KEYRING") === "1");
}
//# sourceMappingURL=credential-store.js.map