/** Where the app lives on its host: "/" locally, "/pocket-ledger/" on GitHub Pages. Set at build time. */
export const BASE_PATH: string = typeof __BASE__ === "string" ? __BASE__ : "/";

/** True for the one-file preview page (no install gate, no service worker). */
export const IS_PREVIEW: boolean = typeof __PREVIEW__ === "boolean" ? __PREVIEW__ : false;

/** True for `npm run dev` builds (no service worker). */
export const IS_DEV: boolean = typeof __DEV__ === "boolean" ? __DEV__ : true;
