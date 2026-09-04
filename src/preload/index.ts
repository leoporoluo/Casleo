import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { Locale } from "../shared/i18n";
import type { AgentEvent, DesktopApi } from "../shared/types";

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: DesktopApi = {
  platform: process.platform,
  app: {
    version: () => ipcRenderer.invoke("app:version"),
    openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
    revealPath: (skillName, hint) => ipcRenderer.invoke("app:reveal-path", skillName, hint),
    revealPackagePath: (source, scope) => ipcRenderer.invoke("app:reveal-package-path", source, scope),
    listSkills: () => ipcRenderer.invoke("app:list-skills"),
    listPlugins: () => ipcRenderer.invoke("app:list-plugins"),
    listPackages: () => ipcRenderer.invoke("app:list-packages"),
    setResourceEnabled: (kind, resourcePath, enabled) => ipcRenderer.invoke("app:set-resource-enabled", kind, resourcePath, enabled),
    deleteResource: (kind, resourcePath) => ipcRenderer.invoke("app:delete-resource", kind, resourcePath),
    setPackageEnabled: (source, scope, enabled) => ipcRenderer.invoke("app:set-package-enabled", source, scope, enabled),
    deletePackage: (source, scope) => ipcRenderer.invoke("app:delete-package", source, scope),
    checkUpdate: () => ipcRenderer.invoke("app:check-update"),
    getLocale: () => ipcRenderer.invoke("app:get-locale"),
    setLocale: (locale: Locale) => ipcRenderer.invoke("app:set-locale", locale),
    preferences: () => ipcRenderer.invoke("app:preferences"),
    savePreferences: (preferences) => ipcRenderer.invoke("app:save-preferences", preferences),
    listPromptTemplates: () => ipcRenderer.invoke("app:list-prompt-templates"),
    savePromptTemplate: (name, content) => ipcRenderer.invoke("app:save-prompt-template", name, content),
    openPromptTemplatesFolder: () => ipcRenderer.invoke("app:open-prompt-templates-folder"),
    openPackagesFolder: () => ipcRenderer.invoke("app:open-packages-folder"),
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
  },
  workspace: {
    choose: () => ipcRenderer.invoke("workspace:choose"),
    recent: () => ipcRenderer.invoke("workspace:recent"),
    forget: (workspacePath) => ipcRenderer.invoke("workspace:forget", workspacePath),
    rename: (workspacePath, name) => ipcRenderer.invoke("workspace:rename", workspacePath, name),
    read: (filePath, cwd) => ipcRenderer.invoke("workspace:read", filePath, cwd),
    open: (filePath, cwd) => ipcRenderer.invoke("workspace:open", filePath, cwd),
    reveal: (filePath, cwd) => ipcRenderer.invoke("workspace:reveal", filePath, cwd),
    list: (cwd) => ipcRenderer.invoke("workspace:list", cwd),
    restore: (files, cwd) => ipcRenderer.invoke("workspace:restore", files, cwd),
    pathForFile: (file) => webUtils.getPathForFile(file),
    onChanged: (listener) => subscribe<string>("workspace:changed", listener),
  },
  services: {
    webSearch: () => ipcRenderer.invoke("services:web-search"),
    saveWebSearch: (config) => ipcRenderer.invoke("services:save-web-search", config),
    mcp: () => ipcRenderer.invoke("services:mcp"),
    saveMcp: (rows) => ipcRenderer.invoke("services:save-mcp", rows),
    revealMcp: () => ipcRenderer.invoke("services:reveal-mcp"),
    deepseekBalance: () => ipcRenderer.invoke("services:deepseek-balance"),
  },
  sessions: {
    list: (cwd) => ipcRenderer.invoke("sessions:list", cwd),
    remove: (id) => ipcRenderer.invoke("sessions:remove", id),
    pin: (id, pinned) => ipcRenderer.invoke("sessions:pin", id, pinned),
    rename: (id, title) => ipcRenderer.invoke("sessions:rename", id, title),
  },
  auth: {
    status: () => ipcRenderer.invoke("auth:status"),
    readApiKey: (provider) => ipcRenderer.invoke("auth:read-api-key", provider),
    saveApiKey: (provider, key, baseUrl, model) => ipcRenderer.invoke("auth:save-api-key", provider, key, baseUrl, model),
    listModels: (baseUrl, apiKey) => ipcRenderer.invoke("auth:list-models", baseUrl, apiKey),
    profiles: () => ipcRenderer.invoke("auth:profiles"),
    saveProfiles: (profiles) => ipcRenderer.invoke("auth:save-profiles", profiles),
    logout: (provider) => ipcRenderer.invoke("auth:logout", provider),
  },
  agent: {
    start: (options) => ipcRenderer.invoke("agent:start", options),
    stop: () => ipcRenderer.invoke("agent:stop"),
    command: (type, data) => ipcRenderer.invoke("agent:command", type, data),
    respondToUi: (id, response) => ipcRenderer.invoke("agent:ui-response", id, response),
    onEvent: (listener) => subscribe<AgentEvent>("agent:event", listener),
    onError: (listener) => subscribe<string>("agent:error", listener),
  },
  onAppCommand: (listener) => subscribe<string>("app:command", listener),
};

contextBridge.exposeInMainWorld("harness", api);
