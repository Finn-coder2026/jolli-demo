/**
 * Library exports for jolli-docs-auto-updater.
 */

export { runUpdater } from "./Updater.js";
export { createClient, getApiKey, generateUpdatedContent } from "./llm/AnthropicClient.js";
export { loadImpactAnalysis } from "./loaders/ImpactLoader.js";
export { loadSectionContent, loadRouteFileContent } from "./loaders/MdxLoader.js";
export { updateSection, updateImpactedSections } from "./generators/SectionUpdater.js";
export type {
	UpdaterOptions,
	ImpactedSection,
	ImpactAnalysis,
	SectionContent,
	UpdatedSection,
	UpdateResult,
} from "./types.js";
