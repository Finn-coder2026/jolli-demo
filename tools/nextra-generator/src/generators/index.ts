import type { GeneratorConfig, GeneratorResult } from "../types.js";
import { generateAppRouterSite } from "./app-router.js";

export { generateAppRouterSite } from "./app-router.js";
export { generateSiteToMemory, getNextra3xFilesToDelete } from "./memory.js";

/**
 * Generate a Nextra 4.x site (App Router only)
 * Note: Page Router (Nextra 3.x) support has been removed.
 * Use App Router for all new sites.
 */
export function generateSite(config: GeneratorConfig): Promise<GeneratorResult> {
	return generateAppRouterSite(config);
}
