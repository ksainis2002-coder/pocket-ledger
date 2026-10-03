import type { Theme } from "../domain/types";

/** Apply the owner's theme choice: "system" follows the device; light or dark override it. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}
