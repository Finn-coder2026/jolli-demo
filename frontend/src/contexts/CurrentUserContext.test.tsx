import { CurrentUserProvider, useCurrentUser } from "./CurrentUserContext";
import { act, renderHook } from "@testing-library/preact";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

function Wrapper({ children }: { children: ReactNode }) {
	return <CurrentUserProvider>{children}</CurrentUserProvider>;
}

function renderCurrentUser() {
	// biome-ignore lint/suspicious/noExplicitAny: renderHook type mismatch requires type override
	return renderHook(() => useCurrentUser(), { wrapper: Wrapper as any });
}

describe("CurrentUserContext", () => {
	it("should initialize with undefined agentHubContext", () => {
		const { result } = renderCurrentUser();

		expect(result.current.userContext.agentHubContext).toBeUndefined();
	});

	it("should throw when used outside CurrentUserProvider", () => {
		expect(() => {
			renderHook(() => useCurrentUser());
		}).toThrow("useCurrentUser must be used within a CurrentUserProvider");
	});

	it("should set agent hub conversation with conversationId and active=true", () => {
		const { result } = renderCurrentUser();

		act(() => {
			result.current.setAgentHubConversation(42);
		});

		expect(result.current.userContext.agentHubContext).toEqual({
			conversationId: 42,
			active: true,
		});
	});

	it("should deactivate agent hub context (set active=false)", () => {
		const { result } = renderCurrentUser();

		act(() => {
			result.current.setAgentHubConversation(42);
		});
		expect(result.current.userContext.agentHubContext?.active).toBe(true);

		act(() => {
			result.current.deactivateAgentHub();
		});

		expect(result.current.userContext.agentHubContext).toEqual({
			conversationId: 42,
			active: false,
		});
	});

	it("should skip deactivation when markAgentNavigating was called", () => {
		const { result } = renderCurrentUser();

		act(() => {
			result.current.setAgentHubConversation(42);
		});
		expect(result.current.userContext.agentHubContext?.active).toBe(true);

		act(() => {
			result.current.markAgentNavigating();
			result.current.deactivateAgentHub();
		});

		// Should remain active because agent triggered the navigation
		expect(result.current.userContext.agentHubContext?.active).toBe(true);
	});

	it("should deactivate on subsequent call after markAgentNavigating was consumed", () => {
		const { result } = renderCurrentUser();

		act(() => {
			result.current.setAgentHubConversation(42);
		});

		// First: agent navigating — skip deactivation
		act(() => {
			result.current.markAgentNavigating();
			result.current.deactivateAgentHub();
		});
		expect(result.current.userContext.agentHubContext?.active).toBe(true);

		// Second: user navigates away — deactivation applies
		act(() => {
			result.current.deactivateAgentHub();
		});
		expect(result.current.userContext.agentHubContext?.active).toBe(false);
	});

	it("should not change state when deactivating with no context", () => {
		const { result } = renderCurrentUser();

		act(() => {
			result.current.deactivateAgentHub();
		});

		expect(result.current.userContext.agentHubContext).toBeUndefined();
	});

	it("should clear the entire context", () => {
		const { result } = renderCurrentUser();

		act(() => {
			result.current.setAgentHubConversation(42);
		});
		expect(result.current.userContext.agentHubContext).toBeDefined();

		act(() => {
			result.current.clearContext();
		});

		expect(result.current.userContext.agentHubContext).toBeUndefined();
	});

	it("should clear context including agentNavigating ref", () => {
		const { result } = renderCurrentUser();

		act(() => {
			result.current.setAgentHubConversation(42);
			result.current.markAgentNavigating();
		});

		act(() => {
			result.current.clearContext();
		});

		// Set a new conversation
		act(() => {
			result.current.setAgentHubConversation(99);
		});

		// Deactivate should work normally (ref was reset by clearContext)
		act(() => {
			result.current.deactivateAgentHub();
		});

		expect(result.current.userContext.agentHubContext?.active).toBe(false);
	});

	it("should update conversationId when switching conversations", () => {
		const { result } = renderCurrentUser();

		act(() => {
			result.current.setAgentHubConversation(1);
		});
		expect(result.current.userContext.agentHubContext?.conversationId).toBe(1);

		act(() => {
			result.current.setAgentHubConversation(2);
		});
		expect(result.current.userContext.agentHubContext?.conversationId).toBe(2);
		expect(result.current.userContext.agentHubContext?.active).toBe(true);
	});
});
