// Install gate (SPEC Install gate): on iPhone and iPad, Safari and the home-screen app keep separate
// storage, so the app asks to be installed before it's used there.

export interface GateInput {
  isIOS: boolean;
  isStandalone: boolean;
  acknowledged: boolean;
}

export type GateResult = "open" | "gate" | "safari-banner";

/** "gate": show the install screen. "safari-banner": the owner chose Safari anyway; show the warning banner. */
export function shouldGate({ isIOS, isStandalone, acknowledged }: GateInput): GateResult {
  if (!isIOS || isStandalone) return "open";
  return acknowledged ? "safari-banner" : "gate";
}

/** iPhone, iPod or iPad, including iPadOS reporting itself as a Mac. */
export function isIOSDevice(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function isStandaloneDisplay(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  return win.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}
