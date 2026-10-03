// Build-time constants injected by scripts/build.mjs (esbuild `define`).
declare const __BASE__: string;
declare const __DEV__: boolean;
declare const __PREVIEW__: boolean;

// CSS files are bundled by esbuild.
declare module "*.css";
