import { getSeededConversationDefinition, getSeededConversationKinds } from "./SeededConversations";
import { describe, expect, it } from "vitest";

describe("SeededConversations", () => {
	describe("getSeededConversationDefinition", () => {
		it("returns the getting_started definition", () => {
			const def = getSeededConversationDefinition("getting_started");
			expect(def).toBeDefined();
			expect(def?.kind).toBe("getting_started");
			expect(def?.title).toBe("Getting Started with Jolli");
			expect(def?.planPhase).toBe("planning");
			expect(def?.introMessage).toContain("Welcome to Jolli");
			expect(def?.introMessage).toContain("Let me check your current setup...");
			expect(def?.introMessage).not.toContain("is your GitHub already connected");
			expect(def?.plan).toContain("Connect GitHub Repository");
			expect(def?.systemPromptAddendum).toBeTruthy();
			expect(def?.systemPromptAddendum).toContain("Proactive Behavior");
		});

		it("has turnReminder defined for getting_started", () => {
			const def = getSeededConversationDefinition("getting_started");
			expect(def?.turnReminder).toBeTruthy();
			expect(def?.turnReminder).toContain("Be proactive");
			expect(def?.turnReminder).toContain("update_plan");
		});

		it("has autoAdvancePrompt defined for getting_started", () => {
			const def = getSeededConversationDefinition("getting_started");
			expect(def?.autoAdvancePrompt).toBeTruthy();
			expect(def?.autoAdvancePrompt).toContain("check_github_status");
			expect(def?.autoAdvancePrompt).toContain("update_plan");
		});

		it("returns undefined for unknown kind", () => {
			const def = getSeededConversationDefinition("nonexistent" as never);
			expect(def).toBeUndefined();
		});

		it("returns undefined turnReminder and autoAdvancePrompt for unknown kind", () => {
			const def = getSeededConversationDefinition("nonexistent" as never);
			expect(def?.turnReminder).toBeUndefined();
			expect(def?.autoAdvancePrompt).toBeUndefined();
		});
	});

	describe("getSeededConversationKinds", () => {
		it("returns all registered kinds", () => {
			const kinds = getSeededConversationKinds();
			expect(kinds).toContain("getting_started");
			expect(kinds.length).toBeGreaterThan(0);
		});
	});
});
