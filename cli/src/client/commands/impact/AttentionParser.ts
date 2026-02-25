/**
 * Attention Parser
 *
 * Wraps shared frontmatter parsing from jolli-common.
 */

import { parseAttentionFrontmatter } from "jolli-common";
import type { AttentionFileRule, DocAttention } from "jolli-common";

export type { AttentionFileRule, DocAttention };

/**
 * Parses attention frontmatter from a document.
 */
export function parseAttention(content: string, docPath: string): DocAttention | null {
	return parseAttentionFrontmatter(content, docPath);
}
