import { vi } from "vitest";

process.stderr.write = () => true;
global.console.error = vi.fn();
global.console.warn = vi.fn();
