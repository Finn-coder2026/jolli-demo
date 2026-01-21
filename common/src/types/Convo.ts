/**
 * An individual chat message.
 */
export type ChatMessage =
	| {
			/**
			 * The role of the person/agent that sent the message.
			 */
			role: "user" | "assistant" | "system";
			/**
			 * The content of the message.
			 */
			content: string;
	  }
	| {
			/**
			 * Assistant initiated a single tool call.
			 */
			role: "assistant_tool_use";
			tool_call_id: string;
			tool_name: string;
			tool_input: unknown;
	  }
	| {
			/**
			 * Assistant initiated multiple tool calls in a single turn.
			 */
			role: "assistant_tool_uses";
			calls: Array<{ tool_call_id: string; tool_name: string; tool_input: unknown }>;
	  }
	| {
			/**
			 * Tool result message.
			 */
			role: "tool";
			tool_call_id: string;
			content: string;
			tool_name: string;
	  };

/**
 * A chat conversation, which includes user chat messages and assistant chat message responses.
 */
export interface Convo {
	/**
	 * The unique convo id.
	 */
	id: number;
	/**
	 * The user id of the user who started the convo.
	 */
	userId: number | undefined;
	/**
	 * The visitor id of the user who started the convo.
	 */
	visitorId: string | undefined;
	/**
	 * The convo title.
	 * This will be a (possibly truncated) copy of the content of the first chat message in the convo.
	 */
	title: string;
	/**
	 * The chat message in the convo, in the order they were posted.
	 */
	messages: Array<ChatMessage>;
	/**
	 * Date and Time string representing when the convo was created.
	 */
	createdAt: string;
	/**
	 * Date and Time string representing when the convo was updated.
	 */
	updatedAt: string;
}

/**
 * Parameters submitted when sendng a streaming chat message.
 */
export interface ChatStreamParameters {
	/**
	 * The current chat messages.
	 */
	messages: Array<ChatMessage>;
	/**
	 * The user message being submitted.
	 */
	userMessage: string;
	/**
	 * Callback made when new content comes back from the streaming response.
	 * @param content the new content.
	 */
	onContent(content: string): void;
	/**
	 * Callback made as soon as a convo id is provided from the streaming response.
	 * This function should update the caller's convo id state with the convo id.
	 * @param convoId the updated convo id or calc function to get the updated convo id from.
	 */
	onConvoId(convoId: number): void;
	/**
	 * Callback made when the streaming response has completed, if one is provided.
	 * @param metadata about the chat message that finished.
	 */
	onDone?: (metadata: Record<string, unknown>) => undefined | undefined;
	/**
	 * A reference that tells if the calling code is ready to stream messages. Used for reactive clinets.
	 */
	readyRef?:
		| {
				current: boolean;
		  }
		| undefined;
	/**
	 * The current convo id, if there is one.
	 */
	activeConvoId?: number | undefined;
	/**
	 * An optional abort signal to pass with the chat client fetch request.
	 */
	signal?: AbortSignal | undefined;
}

/**
 * Parameters sent in the fetch request's JSON body when creating a convo through the client.
 */
export interface CreateConvoRequest {
	/**
	 * The convo title.
	 */
	title?: string;
	/**
	 * The convo messages to create the convo with.
	 */
	messages?: Array<ChatMessage>;
}

/**
 * Parameters sent in the fetch request's JSON body when updating a convo through the client.
 */
export interface UpdateConvoRequest {
	title?: string;
	messages?: Array<ChatMessage>;
}

/**
 * Parameters sent in the fetch request's JSON body when adding a message to a convo through the client.
 */
export interface AddMessageRequest {
	role: "user" | "assistant";
	content: string;
}
