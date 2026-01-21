import type { ChatStreamParameters } from "../types/Convo";
import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/chat";

export const ACTIVE_CONVO_KEY = "jolli_active_convo_id";

export interface ChatClient {
	/**
	 * Submits a chat message and streams out the response.
	 * @param parameters the parameters needed to make the call and stream out the response.
	 */
	stream(parameters: ChatStreamParameters): Promise<void>;
}

/** Process a single SSE line from the chat stream */
function processSSELine(
	line: string,
	callbacks: {
		onContent: (content: string) => void;
		onConvoId: (id: number) => void;
		onDone?: (metadata: Record<string, unknown>) => void;
	},
	readyRef: { current: boolean },
): boolean {
	if (!line.startsWith("data: ")) {
		return false;
	}

	const data = line.slice(6);
	if (data === "[DONE]") {
		return true; // Signal completion
	}

	try {
		const parsed = JSON.parse(data);

		// Handle content chunks
		if (parsed.content && readyRef.current) {
			callbacks.onContent(parsed.content);
		}

		// Handle convo ID
		if (parsed.type === "convoId" && parsed.convoId && readyRef.current) {
			callbacks.onConvoId(parsed.convoId);
		}

		// Handle "done" message if a callback is provided
		if (callbacks.onDone && parsed.type === "done" && parsed.metadata) {
			callbacks.onDone(parsed.metadata);
		}
	} catch {
		// Skip invalid JSON
	}

	return false;
}

/** Read and process chunks from the stream reader */
async function processStreamReader(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	processLine: (line: string) => boolean,
	readyRef: { current: boolean },
): Promise<void> {
	const decoder = new TextDecoder();
	let done = false;

	try {
		while (!done && readyRef.current) {
			const { value, done: readerDone } = await reader.read();
			done = readerDone;

			/* v8 ignore next 3 - defensive check for edge case where value is undefined */
			if (!value || !readyRef.current) {
				continue;
			}

			const chunk = decoder.decode(value, { stream: true });
			const lines = chunk.split("\n");

			for (const line of lines) {
				/* v8 ignore next 4 - defensive check, hard to test without race conditions */
				if (!readyRef.current) {
					return;
				}
				const isComplete = processLine(line);
				if (isComplete) {
					return;
				}
			}
		}
	} finally {
		// Always clean up the reader
		/* v8 ignore next 5 - cleanup code, reader.cancel only exists in production */
		if (reader.cancel) {
			reader.cancel().catch(() => {
				// Ignore cancel errors
			});
		}
	}
}

export function createChatClient(baseUrl: string, auth: ClientAuth): ChatClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;
	return { stream };

	async function stream(parameters: ChatStreamParameters): Promise<void> {
		const { messages, userMessage, onContent, onConvoId, onDone, activeConvoId, signal } = parameters;
		const readyRef = parameters.readyRef ?? { current: true };

		try {
			const response = await fetch(
				`${basePath}/stream`,
				createRequest(
					"POST",
					{
						message: userMessage,
						messages,
						convoId: activeConvoId,
					},
					{
						signal: signal ?? null,
					},
				),
			);

			auth.checkUnauthorized?.(response);
			if (!response.ok) {
				//noinspection ExceptionCaughtLocallyJS
				throw new Error("Failed to get response");
			}

			const reader = response.body?.getReader();
			if (!reader) {
				//noinspection ExceptionCaughtLocallyJS
				throw new Error("No reader available");
			}

			const callbacks = {
				onContent,
				onConvoId,
				...(onDone && { onDone }),
			};
			const processLine = (line: string) => processSSELine(line, callbacks, readyRef);

			await processStreamReader(reader, processLine, readyRef);
		} catch (error) {
			// Ignore abort errors - they're intentional cancellations
			if (error instanceof Error && error.name === "AbortError") {
				return;
			}
			console.error("Error streaming chat:", error);
			if (readyRef.current) {
				onContent("Sorry, I encountered an error. Please try again.");
			}
		}
	}
}
