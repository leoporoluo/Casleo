/** Read a Casleo runtime environment variable. */
export declare function casleoEnv(name: string): string | undefined;
/** Environment for user-facing subprocesses. Strips Electron-as-Node leaks. */
export declare function commandEnvironment(base?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
