import type { PluginStartupFailure } from './plugin-startup-failure'

export type RuntimePhase =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'stopping'
  | 'failed'

export interface RuntimeSnapshot {
  phase: RuntimePhase
  message: string
  launchDirectory?: string
  logs: string[]
  url?: string
  /** Per-process launch token; only `GET /?token=` exchanges it for a session cookie. */
  authToken?: string
  pluginFailures?: PluginStartupFailure[]
}


