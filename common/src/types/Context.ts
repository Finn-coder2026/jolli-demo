/**
 * Provides context fields/objects associated with the current Jolli User.
 */
export interface JolliCurrentUserContext {
	/**
	 * The Agent Hub Context for the current user, if there is one.
	 */
	agentHubContext?: AgentHubContext;
}

/**
 * Provides Agent Hub specific context fields/objects for the Jolli Current User Context.
 */
export interface AgentHubContext {
	/**
	 * The current or last visited Agent Hub conversation id for the current user.
	 */
	conversationId?: number;
	/**
	 * Whether the Agent Hub conversation is active.
	 * An Agent Hub conversation is active if the most recent place the current user navigated to in
	 * the Web UI is an Agent Hub conversation, or the Agent Hub has navigated the current user
	 * away from an Agent Hub conversation to work on something that should be associated with the conversation.
	 */
	active: boolean;
}
