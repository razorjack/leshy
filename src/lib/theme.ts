export type Theme = "light" | "dark";

const KEY = "leshy-theme";
// Match the app.css --background of each theme so the mobile browser chrome
// blends with the page.
const THEME_COLOR: Record<Theme, string> = { dark: "#101b15", light: "#f6f5ef" };

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
