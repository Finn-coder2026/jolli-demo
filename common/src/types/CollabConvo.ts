/**
 * Types of artifacts that can have collaborative conversations
 */
export type ArtifactType = "doc_draft" | "agent_hub" | "cli_workspace";

export type CollabMessageRole = "user" | "assistant" | "system" | "assistant_tool_use" | "assistant_tool_uses" | "tool";

/**
 * A single message in a collaborative conversation
 */
export interface CollabMessage {
	/**
	 * The role of the message sender
	 */
	role: CollabMessageRole;
	/**
	 * The message content
	 */
	content?: string;
	/**
	 * The user ID of the sender (if a user message)
	 */
	userId?: number;
	/**
	 * ISO timestamp of when the message was sent
	 */
	timestamp: string;
}

/**
 * A collaborative conversation tied to an artifact
 */
export interface CollabConvo {
	/**
	 * The unique conversation ID
	 */
	readonly id: number;
	/**
	 * The type of artifact this conversation is for
	 */
	readonly artifactType: ArtifactType;
	/**
	 * The ID of the artifact
	 */
	readonly artifactId: number;
	/**
	 * Optional title for the conversation (used by agent_hub)
	 */
	readonly title?: string;
	/**
	 * The conversation messages
	 */
	readonly messages: Array<CollabMessage>;
	/**
	 * Date and time string representing when the conversation was created
	 */
	readonly createdAt: string;
	/**
	 * Date and time string representing when the conversation was updated
	 */
	readonly updatedAt: string;
}

/**
 * Parameters for creating a new collaborative conversation
 */
export interface CreateCollabConvoRequest {
	/**
	 * The type of artifact
	 */
	artifactType: ArtifactType;
	/**
	 * The ID of the artifact
	 */
	artifactId: number;
}

/**
 * Parameters for sending a message in a collaborative conversation
 */
export interface SendCollabMessageRequest {
	/**
	 * The message content
	 */
	message: string;
	/**
	 * The user ID (optional, extracted from auth token)
	 */
	userId?: number;
}
