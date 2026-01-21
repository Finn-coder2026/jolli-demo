/**
 * Documentation compiler library exports.
 */

export { compileDocumentation, findMdxFiles } from "./Compiler.js";
export {
	parseMdxFile,
	splitByHeadings,
	generateHeadingSlug,
	generateSectionId,
} from "./parsers/MdxParser.js";
export {
	buildContentGraph,
	computeContentHash,
	countWords,
} from "./graph/GraphBuilder.js";
export { buildReverseIndex } from "./index/ReverseIndexer.js";
export { parseArgs, main } from "./Cli.js";
export type {
	CompilerOptions,
	ParsedMdxDocument,
	MdxFrontmatter,
	DocumentSection,
	GraphSection,
	ContentGraph,
	ReverseIndex,
	CompilationResult,
} from "./types.js";
