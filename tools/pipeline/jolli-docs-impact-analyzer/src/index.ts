/**
 * Documentation impact analyzer library exports.
 */

export { analyzeImpact } from "./Analyzer.js";
export { loadChangedContractRefs } from "./loaders/ChangeLoader.js";
export { loadReverseIndex } from "./loaders/IndexLoader.js";
export {
	matchImpactedSections,
	countUniqueSections,
} from "./matchers/ImpactMatcher.js";
export { parseArgs, main } from "./Cli.js";
export type {
	AnalyzerOptions,
	ContractRef,
	ChangedContractRefs,
	ReverseIndex,
	ImpactedSection,
	ImpactAnalysis,
	AnalysisResult,
} from "./types.js";
