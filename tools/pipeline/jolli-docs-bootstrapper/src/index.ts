/**
 * Jolli Docs Bootstrapper
 *
 * A tool for bootstrapping initial MDX documentation from API contracts.
 */

// Main bootstrapper
export { bootstrapDocumentation, isDirectoryEmpty } from "./Bootstrapper.js";

// Generators
export { generateApiReferenceDocs } from "./generators/ApiReferenceGenerator.js";
export { generateOverviewDocs } from "./generators/QuickstartGenerator.js";

// Templates
export { generateApiReferenceMdx } from "./templates/ApiTemplate.js";
export { generateOverviewMdx, generateQuickstartMdx } from "./templates/QuickstartTemplate.js";

// Scanner
export { scanRepository, isRouteFile, extractEndpointInfo } from "./scanners/RepoScanner.js";

// CLI
export { parseArgs, main } from "./Cli.js";

// Types
export type {
	BootstrapperOptions,
	EndpointInfo,
	ScanResult,
	MdxDocument,
	MdxFrontmatter,
	BootstrapResult,
} from "./types.js";
