import { createNavigateUserToolDefinition, executeNavigateUserTool, navigateUserArgsSchema } from "./NavigateUserTool";
import { describe, expect, it } from "vitest";

describe("NavigateUserTool", () => {
	describe("navigateUserArgsSchema", () => {
		it("accepts valid args with all required fields", () => {
			const result = navigateUserArgsSchema.safeParse({
				target: "article-draft",
				targetId: 1,
				label: "Go",
			});
			expect(result.success).toBe(true);
		});

		it("accepts articles as a valid target", () => {
			const result = navigateUserArgsSchema.safeParse({
				target: "articles",
				targetId: 1,
				label: "View",
			});
			expect(result.success).toBe(true);
		});

		it("rejects invalid target enum value", () => {
			const result = navigateUserArgsSchema.safeParse({
				target: "settings",
				targetId: 1,
				label: "Go",
			});
			expect(result.success).toBe(false);
		});

		it("rejects when label is empty string", () => {
			const result = navigateUserArgsSchema.safeParse({
				target: "articles",
				targetId: 1,
				label: "",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("createNavigateUserToolDefinition", () => {
		it("returns a valid tool definition", () => {
			const def = createNavigateUserToolDefinition();
			expect(def.name).toBe("navigate_user");
			expect(def.description).toBeTruthy();
			expect(def.parameters.type).toBe("object");
		});
	});

	describe("executeNavigateUserTool", () => {
		it("returns navigation result for article-draft target", () => {
			const result = executeNavigateUserTool({
				target: "article-draft",
				targetId: 300,
				label: "Edit Draft",
			});
			const parsed = JSON.parse(result);

			expect(parsed).toEqual({
				__navigationAction: true,
				path: "/article-draft/300",
				label: "Edit Draft",
			});
		});

		it("returns navigation result for articles target", () => {
			const result = executeNavigateUserTool({
				target: "articles",
				targetId: 200,
				label: "View Article",
			});
			const parsed = JSON.parse(result);

			expect(parsed).toEqual({
				__navigationAction: true,
				path: "/articles?doc=200",
				label: "View Article",
			});
		});

		it("returns error message for unknown target", () => {
			// Deliberately passing an invalid target to test defensive handling
			const result = executeNavigateUserTool({
				target: "settings" as "articles",
				targetId: 1,
				label: "Settings",
			});

			expect(result).toBe("Unknown navigation target: settings");
		});
	});
});
