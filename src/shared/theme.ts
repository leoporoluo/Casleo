export const THEMES = ["system", "paper", "dark"] as const;
export type ThemeId = (typeof THEMES)[number];
export const DEFAULT_THEME: ThemeId = "system";
export const THEME_STORAGE_KEY = "casleo.theme";

export function parseTheme(value: unknown): ThemeId {
  return THEMES.includes(value as ThemeId) ? (value as ThemeId) : DEFAULT_THEME;
}

export function readStoredTheme(): ThemeId {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: ThemeId): ThemeId {
  const next = parseTheme(theme);
  const resolved = next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : next === "system" ? "paper" : next;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved === "dark" ? "dark" : "light";
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* private mode */
  }
  return next;
}
