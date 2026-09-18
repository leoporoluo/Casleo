/**
 * The Windows window-controls overlay (WCO) height, and with it the height of
 * the strip the page has to keep clear for the system's own caption buttons.
 *
 * The value is shared so the main process (which sizes the overlay) and the
 * preload (which lays the page out around it) can never disagree: a mismatch
 * shows up as either a dead click column or a visible seam under the buttons.
 */
export const WINDOWS_TITLEBAR_HEIGHT = 36
