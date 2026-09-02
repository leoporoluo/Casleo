import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { getTetherHome } from "./home.js";
import { tetherEnv } from "./env.js";
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_MAX_TOKENS = 384_000;
const configuredContextWindow = Number.parseInt(process.env.CASLEO_CONTEXT_WINDOW ?? "", 10);
export const DEEPSEEK_CONTEXT_WINDOW = Number.isFinite(configuredContextWindow) && configuredContextWindow > 0
    ? configuredContextWindow
    : 272_000;
export function parseMaxTokens(value) {
    const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.trim()) : Number.NaN;
    if (!Number.isFinite(n) || n < 1)
        return undefined;
    return Math.min(Math.floor(n), 2_000_000);
}
export function isOfficialDeepSeekBaseUrl(baseUrl) {
    try {
        return new URL(normalizeDeepSeekBaseUrl(baseUrl)).hostname === "api.deepseek.com";
    }
    catch {
        return false;
    }
}
export function resolveMaxTokens(baseUrl, configured) {
    if (isOfficialDeepSeekBaseUrl(baseUrl))
        return DEEPSEEK_MAX_TOKENS;
    return parseMaxTokens(configured) ?? DEEPSEEK_MAX_TOKENS;
}
export function getTetherSettingsPath() {
    return tetherEnv("CONFIG_PATH") ?? path.join(getTetherHome(), "config.json");
}
export function getStoredDeepSeekBaseUrl(settingsPath = getTetherSettingsPath()) {
    try {
        return baseUrlFromSettings(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
    }
    catch (error) {
        if (isNodeError(error) && error.code === "ENOENT")
            return undefined;
        if (error instanceof SyntaxError) {
            throw new Error(`Cannot parse Tether Runtime settings file: ${settingsPath}`);
        }
        throw error;
    }
}
export function getStoredDeepSeekMaxTokens(settingsPath = getTetherSettingsPath()) {
    try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        if (!isRecord(settings) || !isRecord(settings.deepseek))
            return undefined;
        return parseMaxTokens(settings.deepseek.maxTokens);
    }
    catch (error) {
        if (isNodeError(error) && error.code === "ENOENT")
            return undefined;
        if (error instanceof SyntaxError) {
            throw new Error(`Cannot parse Tether Runtime settings file: ${settingsPath}`);
        }
        throw error;
    }
}
export function getTetherStorageSettings(settingsPath = getTetherSettingsPath()) {
    const settings = readSettingsSync(settingsPath);
    const configuredStore = settings.cli_auth_credentials_store;
    const environmentStore = tetherEnv("CREDENTIALS_STORE");
    const credentialStore = parseCredentialStoreMode(environmentStore ?? configuredStore ?? "auto");
    const historyPersistence = parseHistoryPersistence(settings.history?.persistence ?? "save-all");
    const sqliteHome = tetherEnv("SQLITE_HOME") ?? settings.sqlite_home;
    return {
        credentialStore,
        historyPersistence,
        ...(typeof sqliteHome === "string" && sqliteHome.trim()
            ? { sqliteHome: resolveConfiguredPath(sqliteHome) }
            : {}),
    };
}
export function parseCredentialStoreMode(value) {
    if (value === "file" || value === "keyring" || value === "auto")
        return value;
    throw new Error("cli_auth_credentials_store must be file, keyring, or auto");
}
export function parseHistoryPersistence(value) {
    if (value === "save-all" || value === "none")
        return value;
    throw new Error("history.persistence must be save-all or none");
}
export async function saveDeepSeekBaseUrl(baseUrl, settingsPath = getTetherSettingsPath()) {
    const normalized = normalizeDeepSeekBaseUrl(baseUrl);
    const settings = await readSettings(settingsPath);
    settings.deepseek = { ...(settings.deepseek ?? {}), baseUrl: normalized };
    await persistSettings(settings, settingsPath);
    return normalized;
}
export async function saveDeepSeekMaxTokens(maxTokens, settingsPath = getTetherSettingsPath()) {
    const settings = await readSettings(settingsPath);
    const next = { ...(settings.deepseek ?? {}) };
    const parsed = parseMaxTokens(maxTokens);
    if (parsed === undefined)
        delete next.maxTokens;
    else
        next.maxTokens = parsed;
    settings.deepseek = next;
    await persistSettings(settings, settingsPath);
}
async function persistSettings(settings, settingsPath) {
    const directory = path.dirname(settingsPath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700).catch(() => undefined);
    const temporaryPath = `${settingsPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
        await chmod(temporaryPath, 0o600);
        await rename(temporaryPath, settingsPath);
        await chmod(settingsPath, 0o600);
    }
    finally {
        await unlink(temporaryPath).catch(() => undefined);
    }
}
export function normalizeDeepSeekBaseUrl(value) {
    const trimmed = value.trim().replace(/\/+$/, "");
    if (!trimmed)
        throw new Error("API base URL cannot be empty");
    let parsed;
    try {
        parsed = new URL(trimmed);
    }
    catch {
        throw new Error("API base URL must be a valid http(s) URL");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("API base URL must use http or https");
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new Error("API base URL cannot contain credentials, query parameters, or a fragment");
    }
    return trimmed;
}
async function readSettings(settingsPath) {
    try {
        const parsed = JSON.parse(await readFile(settingsPath, "utf8"));
        return isRecord(parsed) ? parsed : {};
    }
    catch (error) {
        if (isNodeError(error) && error.code === "ENOENT")
            return {};
        if (error instanceof SyntaxError) {
            throw new Error(`Cannot parse Tether Runtime settings file: ${settingsPath}`);
        }
        throw error;
    }
}
function readSettingsSync(settingsPath) {
    try {
        const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        return isRecord(parsed) ? parsed : {};
    }
    catch (error) {
        if (isNodeError(error) && error.code === "ENOENT")
            return {};
        if (error instanceof SyntaxError) {
            throw new Error(`Cannot parse Tether Runtime settings file: ${settingsPath}`);
        }
        throw error;
    }
}
function resolveConfiguredPath(value) {
    const trimmed = value.trim();
    if (trimmed === "~")
        return process.env.HOME ?? getTetherHome();
    if (trimmed.startsWith("~/")) {
        return path.resolve(process.env.HOME ?? path.dirname(getTetherHome()), trimmed.slice(2));
    }
    return path.resolve(trimmed);
}
function baseUrlFromSettings(value) {
    if (!isRecord(value) || !isRecord(value.deepseek))
        return undefined;
    const baseUrl = value.deepseek.baseUrl;
    return typeof baseUrl === "string" ? normalizeDeepSeekBaseUrl(baseUrl) : undefined;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNodeError(error) {
    return error instanceof Error && "code" in error;
}
//# sourceMappingURL=settings.js.map
