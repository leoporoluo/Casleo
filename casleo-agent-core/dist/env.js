/** Read a Tether runtime environment variable. */
export function tetherEnv(name) {
    return process.env[`TETHER_${name}`];
}
//# sourceMappingURL=env.js.map