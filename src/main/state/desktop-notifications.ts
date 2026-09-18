import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Desktop-notification preference: one General-settings switch. The Harness
 * renderer reports session-run edges; the desktop decides whether a system
 * toast is shown (the toggle, plus the focus check, both live here so the
 * setting takes effect without any restart).
 *
 * @module desktop-notifications
 */

export interface DesktopNotificationsConfig {
  enabled: boolean
}

const DEFAULT_NOTIFICATIONS_CONFIG: DesktopNotificationsConfig = { enabled: true }

export function notificationsConfigPath(userDataDir: string): string {
  return join(userDataDir, 'notification-config.json')
}

export function readNotificationsConfig(file: string): DesktopNotificationsConfig {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<DesktopNotificationsConfig>
    return { enabled: parsed.enabled !== false }
  } catch {
    return { ...DEFAULT_NOTIFICATIONS_CONFIG }
  }
}

export function writeNotificationsConfig(file: string, config: DesktopNotificationsConfig): void {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}
