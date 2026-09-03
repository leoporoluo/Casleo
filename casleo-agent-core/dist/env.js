/** Read a Casleo runtime environment variable. */
export function casleoEnv(name) {
    return process.env[`CASLEO_${name}`];
}
//# sourceMappingURL=env.js.map