export type Theme = "light" | "dark";

const KEY = "leshy-theme";
// sRGB form of --background in app.css (oklch(0.165 0.018 165) and
// oklch(0.972 0.008 95)), so the mobile browser chrome blends with the page.
// The same two values appear in electron/main.ts and index.html.
const THEME_COLOR: Record<Theme, string> = { dark: "#07110c", light: "#f7f6f0" };

const metaTag = (): Element | null => document.querySelector('meta[name="theme-color"]');

export const applyTheme = (theme: Theme): void => {
  document.documentElement.classList.toggle("dark", theme === "dark");
  metaTag()?.setAttribute("content", THEME_COLOR[theme]);
};

export const currentTheme = (): Theme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";

/** localStorage override, else the OS preference. Call before first paint. */
export const initTheme = (): void => {
  const stored = localStorage.getItem(KEY);
  const theme: Theme =
    stored === "dark" || stored === "light"
      ? stored
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  applyTheme(theme);
};

export const toggleTheme = (): Theme => {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(KEY, next);
  applyTheme(next);
  return next;
};
