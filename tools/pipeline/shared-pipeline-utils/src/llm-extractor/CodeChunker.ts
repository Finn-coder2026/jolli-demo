/**
 * Utilities for chunking code files for LLM processing.
 *
 * Splits code files into chunks that fit within token limits while
 * preserving file boundaries and context.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "glob";
import type { CodeChunk, LLMCostEstimate } from "./types.js";

/** Patterns for finding route-related files */
const ROUTE_FILE_PATTERNS = [
	"**/routes/**/*.{js,ts,mjs,cjs,py,java,go,rb,php,cs,rs}",
	"**/controllers/**/*.{js,ts,mjs,cjs,py,java,go,rb,php,cs,rs}",
	"**/api/**/*.{js,ts,mjs,cjs,py,java,go,rb,php,cs,rs}",
	"**/handlers/**/*.{js,ts,mjs,cjs,py,java,go,rb,php,cs,rs}",
	"**/endpoints/**/*.{js,ts,mjs,cjs,py,java,go,rb,php,cs,rs}",
	"**/*Router*.{js,ts,mjs,cjs}",
	"**/*Controller*.{js,ts,mjs,cjs,java,py,cs}",
	"**/*Handler*.{js,ts,mjs,cjs,go}",
	"**/*Endpoint*.{java}",
	"**/*Resource*.{java}",
	"**/views.py",
	"**/urls.py",
	"**/router.go",
	"**/routes.go",
];

/** Directories to exclude from search */
const EXCLUDE_DIRS = [
	"**/node_modules/**",
	"**/dist/**",
	"**/build/**",
	"**/.git/**",
	"**/vendor/**",
	"**/target/**",
	"**/bin/**",
	"**/obj/**",
	"**/__pycache__/**",
	"**/venv/**",
	"**/.venv/**",
];

/**
 * Estimates the number of tokens in a string.
 * Uses a simple heuristic of ~4 characters per token.
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
	// GPT/Claude tokenizers average about 4 characters per token
	// Add overhead for special formatting
	return Math.ceil(text.length / 4);
}

/**
 * Finds files that likely contain route definitions.
 * @param repoPath - Path to repository
 * @param customPatterns - Optional custom patterns to use instead of defaults
 * @returns List of file paths
 */
export async function findRouteFiles(repoPath: string, customPatterns?: Array<string>): Promise<Array<string>> {
	const patterns = customPatterns ?? ROUTE_FILE_PATTERNS;
	const foundFiles: Array<string> = [];

	for (const pattern of patterns) {
		const matches = await glob(pattern, {
			cwd: repoPath,
			absolute: false,
			ignore: EXCLUDE_DIRS,
		});
		foundFiles.push(...matches);
	}

	// Remove duplicates and sort
	return [...new Set(foundFiles)].sort();
}

/**
 * Prepares code chunks for LLM processing.
 * Groups files into chunks that fit within token limits.
 * @param repoPath - Path to repository
 * @param files - Files to chunk
 * @param maxTokens - Maximum tokens per chunk (default: 8000)
 * @returns Array of code chunks
 */
export async function prepareChunks(
	repoPath: string,
	files: Array<string>,
	maxTokens = 8000,
): Promise<Array<CodeChunk>> {
	const chunks: Array<CodeChunk> = [];
	let currentChunk: CodeChunk = { files: [], content: "", tokenCount: 0 };

	// Reserve tokens for the prompt context
	const effectiveMax = maxTokens - 500;

	for (const file of files) {
		const fullPath = path.join(repoPath, file);

		try {
			const content = await fs.readFile(fullPath, "utf-8");
			const fileHeader = `\n// File: ${file}\n`;
			const fileContent = fileHeader + content + "\n";
			const tokens = estimateTokens(fileContent);

			// If single file exceeds limit, add it as its own chunk
			if (tokens > effectiveMax) {
				// First, save current chunk if it has content
				if (currentChunk.files.length > 0) {
					chunks.push(currentChunk);
					currentChunk = { files: [], content: "", tokenCount: 0 };
				}

				// Truncate large file to fit
				const truncated = truncateContent(fileContent, effectiveMax);
				chunks.push({
					files: [file],
					content: truncated.content,
					tokenCount: truncated.tokens,
				});
				continue;
			}

			// If adding this file exceeds limit, start new chunk
			if (currentChunk.tokenCount + tokens > effectiveMax) {
				chunks.push(currentChunk);
				currentChunk = { files: [], content: "", tokenCount: 0 };
			}

			currentChunk.files.push(file);
			currentChunk.content += fileContent;
			currentChunk.tokenCount += tokens;
		} catch {
			// Skip files that can't be read
		}
	}

	// Don't forget the last chunk
	if (currentChunk.files.length > 0) {
		chunks.push(currentChunk);
	}

	return chunks;
}

/**
 * Truncates content to fit within token limit.
 * Tries to preserve complete functions/classes where possible.
 * @param content - Content to truncate
 * @param maxTokens - Maximum tokens
 * @returns Truncated content and actual token count
 */
function truncateContent(content: string, maxTokens: number): { content: string; tokens: number } {
	const maxChars = maxTokens * 4;

	if (content.length <= maxChars) {
		return { content, tokens: estimateTokens(content) };
	}

	// Truncate at a reasonable boundary (newline)
	let truncated = content.slice(0, maxChars);
	const lastNewline = truncated.lastIndexOf("\n");
	if (lastNewline > maxChars * 0.8) {
		truncated = truncated.slice(0, lastNewline + 1);
	}

	// Add truncation notice
	truncated += "\n// ... (file truncated due to size) ...\n";

	return { content: truncated, tokens: estimateTokens(truncated) };
}

/**
 * Estimates the cost of LLM extraction for the given chunks.
 * Uses Claude Sonnet pricing as reference.
 * @param chunks - Code chunks to process
 * @returns Cost estimate
 */
export function estimateLLMCost(chunks: Array<CodeChunk>, files: Array<string>): LLMCostEstimate {
	const inputTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
	// Estimate ~1000 output tokens per chunk for route extraction
	const outputTokens = chunks.length * 1000;

	// Claude Sonnet pricing (as of 2024)
	const inputCostPer1K = 0.003;
	const outputCostPer1K = 0.015;

	const estimatedCost = (inputTokens / 1000) * inputCostPer1K + (outputTokens / 1000) * outputCostPer1K;

	return {
		inputTokens,
		outputTokens,
		estimatedCost: Math.round(estimatedCost * 10000) / 10000, // Round to 4 decimal places
		chunksToProcess: chunks.length,
		filesToAnalyze: files.length,
	};
}
