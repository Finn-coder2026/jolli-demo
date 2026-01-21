/**
 * Contract Detector
 *
 * A tool for detecting contract changes (environment variables and OpenAPI) in PRs.
 * Designed to run in CI to trigger documentation cascade updates.
 */

// Main detector
export { detectContractChanges } from "./Detector.js";

// Individual detectors
export { detectEnvContracts } from "./detectors/EnvDetector.js";
export { detectOpenApiContracts, isRouteFile } from "./detectors/OpenApiDetector.js";
export { getDetector, runDetector } from "./detectors/DetectorFactory.js";
export { buildOutput } from "./detectors/shared.js";

// Environment variable detection utilities
export { extractEnvVarFromLine, extractEnvVarsFromLines, analyzeEnvChanges } from "./EnvParser.js";
export { extractEnvRefsFromLine, extractEnvRefsFromLines, analyzeCodeRefs } from "./CodeRefDetector.js";

// Git utilities
export {
	getChangedFiles,
	getFileDiff,
	parseUnifiedDiff,
	isEnvFile,
	isSourceFile,
	categorizeChangedFiles,
} from "./GitDiff.js";

// OperationId mapping utilities
export {
	loadOperationIdMapping,
	extractOperationIdFromComment,
	generateOperationIdFromFilename,
	getOperationId,
} from "./mappers/OperationIdMapper.js";

// CLI
export { parseArgs, main } from "./Cli.js";

// Types
export type {
	ContractType,
	ContractRef,
	ChangeSummary,
	ContractChangeOutput,
	DiffLine,
	FileDiff,
	DetectorType,
	DetectorOptions,
} from "./types.js";

export type { OperationIdMapping } from "./mappers/OperationIdMapper.js";
export type { DetectorFunction } from "./detectors/DetectorFactory.js";
