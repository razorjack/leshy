export type Theme = "light" | "dark";
/** What the user picked. "system" is the absence of a choice: follow the OS. */
export type ThemeSetting = Theme | "system";

const KEY = "leshy-theme";
// sRGB form of --background in app.css (oklch(0.165 0.018 165) and
// oklch(0.972 0.008 95)), so the mobile browser chrome blends with the page.
// The same two values appear in electron/main.ts and index.html.
const THEME_COLOR: Record<Theme, string> = { dark: "#07110c", light: "#f7f6f0" };

const darkQuery = (): MediaQueryList => window.matchMedia("(prefers-color-scheme: dark)");

const metaTag = (): Element | null => document.querySelector('meta[name="theme-color"]');

const other = (theme: Theme): Theme => (theme === "dark" ? "light" : "dark");

const nextThemeSetting = (setting: ThemeSetting, systemTheme: Theme): ThemeSetting => {
  if (setting === "system") return other(systemTheme);
  if (setting === systemTheme) return "system";
  return other(setting);
};

const applyTheme = (theme: Theme): void => {
  document.documentElement.classList.toggle("dark", theme === "dark");
  metaTag()?.setAttribute("content", THEME_COLOR[theme]);
};

const resolve = (setting: ThemeSetting): Theme =>
  setting === "system" ? (darkQuery().matches ? "dark" : "light") : setting;

/** The stored choice, or "system" when there is none. */
export const themeSetting = (): ThemeSetting => {
  const stored = localStorage.getItem(KEY);
  return stored === "dark" || stored === "light" ? stored : "system";
};

export const setTheme = (setting: ThemeSetting): void => {
  if (setting === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, setting);
  applyTheme(resolve(setting));
};

/**
 * Cycles the three settings, always leaving the OS one click away. An explicit
 * theme steps to "system" only once it agrees with what the OS asks for, so
 * every click but that last one changes what you see.
 */
export const cycleTheme = (): ThemeSetting => {
  const setting = themeSetting();
  const systemTheme = resolve("system");
  const next = nextThemeSetting(setting, systemTheme);
  setTheme(next);
  return next;
};

/** Call before first paint. */
export const initTheme = (): void => {
  applyTheme(resolve(themeSetting()));
  // On "system" the OS preference can change while the app is open: a scheduled
  // switch at sunset, or the Electron shell following the platform.
  darkQuery().addEventListener("change", () => {
    if (themeSetting() === "system") applyTheme(resolve("system"));
  });
};
