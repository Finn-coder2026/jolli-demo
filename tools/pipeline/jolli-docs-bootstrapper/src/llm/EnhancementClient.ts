/**
 * Anthropic API client for enhancing generated documentation.
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
 * Get Anthropic API key from environment.
 * @returns API key or null if not found
 */
export function getApiKey(): string | null {
	// Load environment if not already loaded
	if (!process.env.ANTHROPIC_API_KEY) {
		loadEnvironment();
	}

	return process.env.ANTHROPIC_API_KEY || null;
}

/**
 * Create Anthropic client if API key is available.
 * @returns Anthropic client instance or null
 */
export function createClient(): Anthropic | null {
	const key = getApiKey();
	if (!key) {
		return null;
	}

	return new Anthropic({ apiKey: key });
}

/**
 * Enhance generated documentation using Claude.
 * @param client - Anthropic client
 * @param content - Generated MDX content (body only, no frontmatter)
 * @param routeFileContent - Route file source code
 * @param operationId - Operation ID
 * @param model - Model to use
 * @returns Enhanced documentation content (body only)
 */
export async function enhanceDocumentation(
	client: Anthropic,
	content: string,
	routeFileContent: string,
	operationId: string,
	model: string = "claude-sonnet-4-5-20250929",
): Promise<string> {
	const prompt = `You are a technical documentation expert. You are enhancing API documentation based on actual route implementation code.

OPERATION ID: ${operationId}

ROUTE FILE CODE:
\`\`\`typescript
${routeFileContent}
\`\`\`

GENERATED DOCUMENTATION TEMPLATE (body only, frontmatter will be added separately):
${content}

TASK:
1. Analyze the route file code to understand:
   - What the endpoint does
   - Request parameters and body structure
   - Response format and status codes
   - Error handling
   - Authentication requirements
   - Rate limiting or other middleware
2. Enhance the documentation template with accurate, specific information from the code
3. Replace placeholder text like "_To be documented_" with actual details
4. Add concrete examples based on the implementation
5. Keep the same markdown heading structure
6. Be concise and technical - this is API reference documentation

IMPORTANT:
- Return ONLY the enhanced markdown content (body only), nothing else
- Do NOT include frontmatter (it will be preserved separately)
- Do NOT include explanatory text like "Here's the enhanced documentation"
- Do NOT wrap the output in markdown code blocks
- Keep the same heading structure (e.g., ## Overview, ## Request, ## Response)
- If you cannot determine something from the code, keep the placeholder`;

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
	const responseContent = response.content[0];
	if (responseContent.type !== "text") {
		throw new Error("Unexpected response type from Claude");
	}

	return responseContent.text.trim();
}
