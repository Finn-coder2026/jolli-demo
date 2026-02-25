const CONVO_REQUEST_SCOPED_EVENTS = new Set([
	"content_chunk",
	"tool_event",
	"article_updated",
	"message_complete",
	"error",
]);

const CONVO_USER_SCOPED_EVENTS = new Set(["typing", "user_joined", "user_left"]);

const CONVO_TERMINAL_EVENTS = new Set(["message_complete", "error"]);

export function isSelfEchoByUserId(eventUserId: number | undefined, currentUserId: number | undefined): boolean {
	return eventUserId !== undefined && currentUserId !== undefined && eventUserId === currentUserId;
}

export function shouldIgnoreConvoSelfEcho(
	eventType: string,
	eventUserId: number | undefined,
	currentUserId: number | undefined,
	clientRequestId: string | undefined,
	pendingClientRequestIds: Set<string>,
): boolean {
	if (clientRequestId && CONVO_REQUEST_SCOPED_EVENTS.has(eventType) && pendingClientRequestIds.has(clientRequestId)) {
		return true;
	}

	if (CONVO_USER_SCOPED_EVENTS.has(eventType) && isSelfEchoByUserId(eventUserId, currentUserId)) {
		return true;
	}

	return false;
}

export function isConvoTerminalEvent(eventType: string): boolean {
	return CONVO_TERMINAL_EVENTS.has(eventType);
}
