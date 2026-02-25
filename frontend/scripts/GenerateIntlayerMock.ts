#!/usr/bin/env node
/**
 * Generates IntlayerMock.ts from built intlayer dictionaries
 * This ensures test mocks stay in sync with actual content
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface DictionaryFile {
	key: string;
	content: {
		nodeType: string;
		translation: {
			en: Record<string, unknown>;
			es?: Record<string, unknown>;
		};
	};
}

const DICTIONARY_DIR = join(process.cwd(), ".intlayer", "dictionary");
const OUTPUT_FILE = join(process.cwd(), "src", "test", "IntlayerMock.ts");

/** Recursively sort all object keys for deterministic serialization */
function deepSortKeys(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(deepSortKeys);
	}
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [k, deepSortKeys(v)]),
		);
	}
	return value;
}

function main() {
	// biome-ignore lint/suspicious/noConsole: CLI script that outputs progress to user
	console.log("Generating IntlayerMock.ts from built dictionaries...");

	// Read all dictionary JSON files
	const files = readdirSync(DICTIONARY_DIR)
		.filter(f => f.endsWith(".json"))
		.sort();

	if (files.length === 0) {
		console.error("Error: No dictionary files found. Run 'npm run build:intlayer' first.");
		process.exit(1);
	}

	// Build the CONTENT_MAP object
	const contentMap: Record<string, Record<string, unknown>> = {};

	for (const file of files) {
		const filePath = join(DICTIONARY_DIR, file);
		const content = JSON.parse(readFileSync(filePath, "utf-8")) as DictionaryFile;

		// Use the key from the file and extract English translations
		if (content.content?.translation?.en) {
			contentMap[content.key] = content.content.translation.en;
		}
	}

	// Generate the TypeScript file
	const output = `// AUTO-GENERATED FILE - DO NOT EDIT
// Generated from .intlayer/dictionary/*.json files
// Run 'npm run generate:intlayer-mock' to regenerate

/**
 * Mock content map for testing
 * Contains English translations from all intlayer content files
 */
export const CONTENT_MAP: Record<string, Record<string, unknown>> = ${JSON.stringify(
		deepSortKeys(contentMap),
		null,
		"\t",
	)};
`;

	writeFileSync(OUTPUT_FILE, output, "utf-8");

	// biome-ignore lint/suspicious/noConsole: CLI script that outputs results to user
	console.log(`✓ Generated ${OUTPUT_FILE}`);
	// biome-ignore lint/suspicious/noConsole: CLI script that outputs results to user
	console.log(`  Processed ${files.length} dictionary files`);
	// biome-ignore lint/suspicious/noConsole: CLI script that outputs results to user
	console.log(`  Exported ${Object.keys(contentMap).length} content keys`);
}

main();
