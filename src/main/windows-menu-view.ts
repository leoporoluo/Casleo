import type { Rectangle } from 'electron'
import { WINDOWS_TITLEBAR_HEIGHT } from '../shared/desktop-menu'

export const WINDOWS_CAPTION_CONTROLS_WIDTH = 140
export const WINDOWS_MENU_BUTTON_WIDTH = 44
export const WINDOWS_MENU_PANEL_WIDTH = 304
export const WINDOWS_MENU_PANEL_MAX_HEIGHT = 760

interface ContentSize {
  width: number
  height: number
}

interface Column {
  x: number
  width: number
}

/**
 * The right-hand column the menu surfaces live in: the content width minus the
 * native caption controls, holding the requested width when it fits.
 */
function menuColumn(contentSize: ContentSize, requestedWidth: number, fullscreen: boolean): Column {
  const contentWidth = Math.max(0, Math.floor(contentSize.width))
  const captionWidth = fullscreen
    ? 0
    : Math.min(WINDOWS_CAPTION_CONTROLS_WIDTH, contentWidth)
  const availableWidth = Math.max(0, contentWidth - captionWidth)
  const width = Math.min(requestedWidth, availableWidth)

  return { x: Math.max(0, contentWidth - captionWidth - width), width }
}

/**
 * The application-menu button keeps this rectangle for the whole window lifetime.
 *
 * It is deliberately independent of the menu state: resizing a view that sits
 * over the caption strip repaints that strip, which reads as the titlebar
 * flickering whenever the menu is toggled.
 */
export function windowsMenuButtonBounds(contentSize: ContentSize, fullscreen = false): Rectangle {
  const contentHeight = Math.max(0, Math.floor(contentSize.height))
  const { x, width } = menuColumn(contentSize, WINDOWS_MENU_BUTTON_WIDTH, fullscreen)

  return {
    x,
    y: 0,
    width,
    height: Math.min(WINDOWS_TITLEBAR_HEIGHT, contentHeight)
  }
}

/**
 * The panel surface starts below the button strip, so the button keeps its own
 * clicks while the panel is open, and is hidden rather than resized when closed.
 */
export function windowsMenuPanelBounds(contentSize: ContentSize, fullscreen = false): Rectangle {
  const contentHeight = Math.max(0, Math.floor(contentSize.height))
  const { x, width } = menuColumn(contentSize, WINDOWS_MENU_PANEL_WIDTH, fullscreen)
  const top = Math.min(WINDOWS_TITLEBAR_HEIGHT, contentHeight)

  return {
    x,
    y: top,
    width,
    height: Math.min(WINDOWS_MENU_PANEL_MAX_HEIGHT, contentHeight - top)
  }
}
