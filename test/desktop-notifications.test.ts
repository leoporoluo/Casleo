import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  notificationsConfigPath,
  readNotificationsConfig,
  writeNotificationsConfig
} from '../src/main/state/desktop-notifications'

const projectRoot = path.resolve(import.meta.dirname, '..')

describe('desktop notification preference', () => {
  it('defaults to enabled and survives a corrupt file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'casleo-notify-'))
    try {
      const file = notificationsConfigPath(dir)
      expect(readNotificationsConfig(file)).toEqual({ enabled: true })

      writeNotificationsConfig(file, { enabled: false })
      expect(readNotificationsConfig(file)).toEqual({ enabled: false })

      writeNotificationsConfig(file, { enabled: true })
      expect(readNotificationsConfig(file)).toEqual({ enabled: true })

      await writeFile(file, 'not json', 'utf8')
      expect(readNotificationsConfig(file)).toEqual({ enabled: true })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('wires the toggle and the focused-window check through the desktop', async () => {
    const [main, preload, client] = await Promise.all([
      readFile(path.join(projectRoot, 'src', 'main', 'index.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'src', 'preload', 'index.ts'), 'utf8'),
      readFile(path.join(projectRoot, 'packages', 'dsh-desktop-client-ui', 'client.js'), 'utf8')
    ])

    expect(main).toContain("ipcMain.handle('desktop-notification:get'")
    expect(main).toContain("ipcMain.handle('desktop-notification:set'")
    expect(main).toContain("ipcMain.handle('desktop-notification:show'")
    expect(main).toContain('assertTrustedMainWindowEvent(event)')
    // The toast only fires while the window lacks the foreground.
    expect(main).toContain('const hasAttention = window.isFocused() && !window.isMinimized() && window.isVisible()')
    expect(main).toContain('if (!config.enabled || hasAttention) return { ok: true, shown: false }')
    expect(main).toContain('toast.on')
    expect(main).toContain("app.setAppUserModelId('com.casleo.desktop')")

    expect(preload).toContain('getNotificationsEnabled:')
    expect(preload).toContain("ipcRenderer.invoke('desktop-notification:set', enabled)")
    expect(preload).toContain('notifyRunEnded:')

    expect(client).toContain("inject = ['slots', 'locale', 'sessions']")
    expect(client).toContain("id: 'casleo-notifications'")
    expect(client).toContain('prev === true && item.running !== true')
  })
})
