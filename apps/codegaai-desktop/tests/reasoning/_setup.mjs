import { createRequire } from "node:module";

export const require = createRequire(import.meta.url);
export const assert = await import("node:assert/strict");
