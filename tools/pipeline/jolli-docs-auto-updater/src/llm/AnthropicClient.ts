/**
 * Anthropic API client for generating documentation updates.
 */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load environment variables from .env.local if it exists.
 * Looks for .env.local in the backend directory.
 */
function loadEnvironment(): void {
	// Try to load from backend/.env.local
	const envPath = resolve(process.cwd(), "backend", ".env.local");
	if (existsSync(envPath)) {
		config({ path: envPath });
	}
}

/**
 * Get Anthropic API key from environment or parameter.
 * @param providedKey - Optional API key provided directly
 * @returns API key
 * @throws Error if key not found
 */
export function getApiKey(providedKey?: string): string {
	if (providedKey) {
		return providedKey;
	}

	// Load environment if not already loaded
	if (!process.env.ANTHROPIC_API_KEY) {
		loadEnvironment();
	}

	const key = process.env.ANTHROPIC_API_KEY;
	if (!key) {
		throw new Error(
			"ANTHROPIC_API_KEY not found. Set it in backend/.env.local or provide via --api-key option.",
		);
	}

	return key;
}

/**
 * Create Anthropic client.
 * @param apiKey - API key (loaded from env if not provided)
 * @returns Anthropic client instance
 */
export function createClient(apiKey?: string): Anthropic {
	const key = getApiKey(apiKey);
	return new Anthropic({ apiKey: key });
}

/**
 * Generate updated documentation content using Claude.
 * @param client - Anthropic client
 * @param model - Model to use
 * @param sectionContent - Current section content
 * @param routeFileContent - Changed route file content
 * @param contractRef - Contract reference (operationId)
 * @returns Updated documentation content
 */
export async function generateUpdatedContent(
	client: Anthropic,
	model: string,
	sectionContent: string,
	routeFileContent: string,
	contractRef: string,
): Promise<string> {
	const prompt = `You are a technical documentation expert. You are updating API documentation to reflect code changes.

CONTRACT REFERENCE: ${contractRef}

CURRENT ROUTE FILE CODE:
\`\`\`typescript
${routeFileContent}
\`\`\`

CURRENT DOCUMENTATION SECTION:
${sectionContent}

TASK:
1. Analyze the route file code to understand what the endpoint does
2. Update the documentation section to accurately reflect the current implementation
3. Maintain the same markdown structure and formatting
4. Keep the same heading level and heading text
5. Update only the content that needs to change based on the code
6. If the current documentation is already accurate, return it unchanged
7. Be concise and technical - this is API reference documentation

IMPORTANT:
- Return ONLY the updated documentation content, nothing else
- Do NOT include explanatory text like "Here's the updated documentation"
- Do NOT wrap the output in markdown code blocks
- Preserve all frontmatter exactly as-is if present
- Keep the same heading structure`;

	const response = await client.messages.create({
		model,
		max_tokens: 4096,
		messages: [
			{
				role: "user",
				content: prompt,
			},
		],
	});

	// Extract text from response
	const content = response.content[0];
	if (content.type !== "text") {
		throw new Error("Unexpected response type from Claude");
	}

	return content.text.trim();
}
