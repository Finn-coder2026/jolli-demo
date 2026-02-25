/**
 * Tests for PreferencesRegistry.
 *
 * Ensures all preference definitions have correct default values
 * and validation functions work as expected.
 */

import { PREFERENCES, type PreferenceValue } from "./PreferencesRegistry";
import { describe, expect, it } from "vitest";

describe("PreferencesRegistry", () => {
	describe("PREFERENCES object", () => {
		it("should export a PREFERENCES object with all expected keys", () => {
			expect(PREFERENCES).toBeDefined();
			expect(PREFERENCES.theme).toBeDefined();
			expect(PREFERENCES.sidebarCollapsed).toBeDefined();
			expect(PREFERENCES.useUnifiedSidebar).toBeDefined();
			expect(PREFERENCES.sidebarSpacesExpanded).toBeDefined();
			expect(PREFERENCES.sidebarSitesExpanded).toBeDefined();
			expect(PREFERENCES.spacesTreePanelPinned).toBeDefined();
			expect(PREFERENCES.favoriteSpaces).toBeDefined();
			expect(PREFERENCES.favoriteSites).toBeDefined();
			expect(PREFERENCES.chatWidth).toBeDefined();
			expect(PREFERENCES.chatbotPosition).toBeDefined();
			expect(PREFERENCES.articleDraftChatPaneWidth).toBeDefined();
			expect(PREFERENCES.articleListPanelCollapsed).toBeDefined();
			expect(PREFERENCES.articlesDraftFilter).toBeDefined();
			expect(PREFERENCES.articleDraftShowToolDetails).toBeDefined();
			expect(PREFERENCES.currentSpaceId).toBeDefined();
			expect(PREFERENCES.lastActivityTime).toBeDefined();
			expect(PREFERENCES.disableLogging).toBeDefined();
			expect(PREFERENCES.logLevel).toBeDefined();
			expect(PREFERENCES.logPretty).toBeDefined();
			expect(PREFERENCES.logLevelOverrides).toBeDefined();
			expect(PREFERENCES.panelWidth).toBeDefined();
		});
	});

	describe("theme preference", () => {
		it("should have correct default value", () => {
			expect(PREFERENCES.theme.defaultValue).toBe("system");
		});

		it("should have correct scope", () => {
			expect(PREFERENCES.theme.scope).toBe("tenant");
		});

		it("should serialize and deserialize correctly", () => {
			expect(PREFERENCES.theme.serialize("light")).toBe("light");
			expect(PREFERENCES.theme.serialize("dark")).toBe("dark");
			expect(PREFERENCES.theme.serialize("system")).toBe("system");
			expect(PREFERENCES.theme.deserialize("light")).toBe("light");
			expect(PREFERENCES.theme.deserialize("dark")).toBe("dark");
			expect(PREFERENCES.theme.deserialize("system")).toBe("system");
		});

		it("should validate correctly", () => {
			expect(PREFERENCES.theme.validate?.("system")).toBe(true);
			expect(PREFERENCES.theme.validate?.("light")).toBe(true);
			expect(PREFERENCES.theme.validate?.("dark")).toBe(true);
			expect(PREFERENCES.theme.validate?.("invalid" as "system")).toBe(false);
		});
	});

	describe("chatWidth preference", () => {
		it("should have correct default value", () => {
			expect(PREFERENCES.chatWidth.defaultValue).toBe(600);
		});

		it("should validate minimum value", () => {
			expect(PREFERENCES.chatWidth.validate?.(300)).toBe(true);
			expect(PREFERENCES.chatWidth.validate?.(299)).toBe(false);
		});

		it("should validate maximum value", () => {
			expect(PREFERENCES.chatWidth.validate?.(800)).toBe(true);
			expect(PREFERENCES.chatWidth.validate?.(801)).toBe(false);
		});

		it("should validate values in range", () => {
			expect(PREFERENCES.chatWidth.validate?.(500)).toBe(true);
			expect(PREFERENCES.chatWidth.validate?.(600)).toBe(true);
		});
	});

	describe("chatbotPosition preference", () => {
		it("should have correct default value", () => {
			expect(PREFERENCES.chatbotPosition.defaultValue).toBe("right");
		});

		it("should serialize and deserialize correctly", () => {
			expect(PREFERENCES.chatbotPosition.serialize("left")).toBe("left");
			expect(PREFERENCES.chatbotPosition.serialize("right")).toBe("right");
			expect(PREFERENCES.chatbotPosition.deserialize("left")).toBe("left");
			expect(PREFERENCES.chatbotPosition.deserialize("right")).toBe("right");
		});

		it("should validate correctly", () => {
			expect(PREFERENCES.chatbotPosition.validate?.("left")).toBe(true);
			expect(PREFERENCES.chatbotPosition.validate?.("right")).toBe(true);
			expect(PREFERENCES.chatbotPosition.validate?.("center" as "left")).toBe(false);
		});
	});

	describe("articleDraftChatPaneWidth preference", () => {
		it("should have correct default value", () => {
			expect(PREFERENCES.articleDraftChatPaneWidth.defaultValue).toBe(320);
		});

		it("should validate minimum value", () => {
			expect(PREFERENCES.articleDraftChatPaneWidth.validate?.(200)).toBe(true);
			expect(PREFERENCES.articleDraftChatPaneWidth.validate?.(199)).toBe(false);
		});

		it("should validate maximum value", () => {
			expect(PREFERENCES.articleDraftChatPaneWidth.validate?.(600)).toBe(true);
			expect(PREFERENCES.articleDraftChatPaneWidth.validate?.(601)).toBe(false);
		});
	});

	describe("articlesDraftFilter preference", () => {
		it("should have correct default value", () => {
			expect(PREFERENCES.articlesDraftFilter.defaultValue).toBe("all");
		});

		it("should have correct scope", () => {
			expect(PREFERENCES.articlesDraftFilter.scope).toBe("tenant-org");
		});

		it("should serialize and deserialize correctly", () => {
			expect(PREFERENCES.articlesDraftFilter.serialize("all")).toBe("all");
			expect(PREFERENCES.articlesDraftFilter.serialize("my-new-drafts")).toBe("my-new-drafts");
			expect(PREFERENCES.articlesDraftFilter.deserialize("shared-with-me")).toBe("shared-with-me");
			expect(PREFERENCES.articlesDraftFilter.deserialize("suggested-updates")).toBe("suggested-updates");
		});

		it("should validate all valid filter values", () => {
			expect(PREFERENCES.articlesDraftFilter.validate?.("all")).toBe(true);
			expect(PREFERENCES.articlesDraftFilter.validate?.("my-new-drafts")).toBe(true);
			expect(PREFERENCES.articlesDraftFilter.validate?.("shared-with-me")).toBe(true);
			expect(PREFERENCES.articlesDraftFilter.validate?.("suggested-updates")).toBe(true);
		});

		it("should reject invalid filter values", () => {
			expect(PREFERENCES.articlesDraftFilter.validate?.("invalid" as "all")).toBe(false);
		});
	});

	describe("panelWidth dynamic preference", () => {
		it("should create preference with custom key", () => {
			const leftPanel = PREFERENCES.panelWidth("leftPanel");
			expect(leftPanel.key).toBe("leftPanel");
			expect(leftPanel.defaultValue).toBe(50);
			expect(leftPanel.scope).toBe("tenant");
		});

		it("should create different preferences for different keys", () => {
			const leftPanel = PREFERENCES.panelWidth("leftPanel");
			const rightPanel = PREFERENCES.panelWidth("rightPanel");
			expect(leftPanel.key).not.toBe(rightPanel.key);
		});

		it("should validate panel width range", () => {
			const panel = PREFERENCES.panelWidth("testPanel");
			expect(panel.validate?.(0)).toBe(true);
			expect(panel.validate?.(50)).toBe(true);
			expect(panel.validate?.(100)).toBe(true);
			expect(panel.validate?.(-1)).toBe(false);
			expect(panel.validate?.(101)).toBe(false);
		});
	});

	describe("lastViewedArticle dynamic preference", () => {
		it("should create preference with space-specific key", () => {
			const pref = PREFERENCES.lastViewedArticle(42);
			expect(pref.key).toBe("spaces.lastViewedArticle.42");
			expect(pref.defaultValue).toBe(null);
			expect(pref.scope).toBe("tenant-org");
		});

		it("should create different preferences for different spaces", () => {
			const pref1 = PREFERENCES.lastViewedArticle(1);
			const pref2 = PREFERENCES.lastViewedArticle(2);
			expect(pref1.key).not.toBe(pref2.key);
		});

		it("should serialize and deserialize number values", () => {
			const pref = PREFERENCES.lastViewedArticle(1);
			expect(pref.serialize(123)).toBe("123");
			expect(pref.deserialize("123")).toBe(123);
		});

		it("should serialize and deserialize null values", () => {
			const pref = PREFERENCES.lastViewedArticle(1);
			expect(pref.serialize(null)).toBe("");
			expect(pref.deserialize("")).toBe(null);
		});
	});

	describe("boolean preferences", () => {
		it("sidebarCollapsed should have correct defaults", () => {
			expect(PREFERENCES.sidebarCollapsed.defaultValue).toBe(false);
			expect(PREFERENCES.sidebarCollapsed.scope).toBe("tenant");
		});

		it("useUnifiedSidebar should default to true", () => {
			expect(PREFERENCES.useUnifiedSidebar.defaultValue).toBe(true);
		});

		it("sidebarSpacesExpanded should default to true", () => {
			expect(PREFERENCES.sidebarSpacesExpanded.defaultValue).toBe(true);
		});

		it("sidebarSitesExpanded should default to true", () => {
			expect(PREFERENCES.sidebarSitesExpanded.defaultValue).toBe(true);
		});

		it("spacesTreePanelPinned should default to true", () => {
			expect(PREFERENCES.spacesTreePanelPinned.defaultValue).toBe(true);
		});

		it("articleListPanelCollapsed should default to false", () => {
			expect(PREFERENCES.articleListPanelCollapsed.defaultValue).toBe(false);
		});

		it("articleDraftShowToolDetails should default to false", () => {
			expect(PREFERENCES.articleDraftShowToolDetails.defaultValue).toBe(false);
		});

		it("disableLogging should default to false", () => {
			expect(PREFERENCES.disableLogging.defaultValue).toBe(false);
			expect(PREFERENCES.disableLogging.scope).toBe("global");
		});

		it("logPretty should default to true", () => {
			expect(PREFERENCES.logPretty.defaultValue).toBe(true);
		});
	});

	describe("array preferences", () => {
		it("favoriteSpaces should have correct defaults", () => {
			expect(PREFERENCES.favoriteSpaces.defaultValue).toEqual([]);
			expect(PREFERENCES.favoriteSpaces.scope).toBe("tenant-org");
		});

		it("favoriteSites should have correct defaults", () => {
			expect(PREFERENCES.favoriteSites.defaultValue).toEqual([]);
			expect(PREFERENCES.favoriteSites.scope).toBe("tenant-org");
		});
	});

	describe("nullable preferences", () => {
		it("currentSpaceId should have correct defaults", () => {
			expect(PREFERENCES.currentSpaceId.defaultValue).toBe(null);
			expect(PREFERENCES.currentSpaceId.scope).toBe("tenant-org");
		});
	});

	describe("global preferences", () => {
		it("lastActivityTime should have correct defaults", () => {
			expect(PREFERENCES.lastActivityTime.defaultValue).toBe(0);
			expect(PREFERENCES.lastActivityTime.scope).toBe("global");
		});

		it("logLevel should have correct defaults", () => {
			expect(PREFERENCES.logLevel.defaultValue).toBe("info");
			expect(PREFERENCES.logLevel.scope).toBe("global");
		});

		it("logLevelOverrides should have correct defaults", () => {
			expect(PREFERENCES.logLevelOverrides.defaultValue).toBe("");
			expect(PREFERENCES.logLevelOverrides.scope).toBe("global");
		});
	});

	describe("PreferenceValue type", () => {
		it("should infer correct types (compile-time check)", () => {
			// These are compile-time type checks
			const themeValue: PreferenceValue<typeof PREFERENCES.theme> = "system";
			const chatWidthValue: PreferenceValue<typeof PREFERENCES.chatWidth> = 600;
			const sidebarValue: PreferenceValue<typeof PREFERENCES.sidebarCollapsed> = false;
			const favoritesValue: PreferenceValue<typeof PREFERENCES.favoriteSpaces> = [1, 2, 3];

			expect(themeValue).toBe("system");
			expect(chatWidthValue).toBe(600);
			expect(sidebarValue).toBe(false);
			expect(favoritesValue).toEqual([1, 2, 3]);
		});
	});
});
