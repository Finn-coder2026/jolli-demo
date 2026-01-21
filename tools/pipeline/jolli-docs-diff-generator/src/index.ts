/**
 * Documentation diff generator library exports.
 */

export { generateDiff } from "./DiffGenerator.js";
export { loadContentGraph } from "./loaders/GraphLoader.js";
export { generateVersionDiff } from "./comparers/SectionComparer.js";
export { parseArgs, main } from "./Cli.js";
export type {
	DiffGeneratorOptions,
	GraphSection,
	ContentGraph,
	AddedSection,
	RemovedSection,
	ModifiedSection,
	VersionDiff,
	DiffResult,
} from "./types.js";
