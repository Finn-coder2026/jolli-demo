/**
 * Tests for GetOrCreateSpaceTool.
 */

import { getOrCreateSpaceTool } from "./GetOrCreateSpaceTool";
import { createMockToolContext } from "./ToolTestUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GetOrCreateSpaceTool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("definition", () => {
		it("should have correct tool name", () => {
			expect(getOrCreateSpaceTool.definition.name).toBe("get_or_create_space");
		});

		it("should require the repository parameter", () => {
			expect(getOrCreateSpaceTool.definition.parameters.required).toContain("repository");
		});
	});

	describe("handler", () => {
		it("should return existing space when slug matches", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.spaceDao.getSpaceBySlug).mockResolvedValueOnce({
				id: 5,
				name: "docs",
				slug: "docs",
			} as never);

			const result = await getOrCreateSpaceTool.handler({ repository: "acme/docs" }, ctx);
			const parsed = JSON.parse(result.content);

			expect(result.success).toBe(true);
			expect(parsed.created).toBe(false);
			expect(parsed.spaceId).toBe(5);
			expect(parsed.name).toBe("docs");
			expect(parsed.slug).toBe("docs");
			expect(parsed.message).toContain("existing space");
			expect(ctx.spaceDao.createSpace).not.toHaveBeenCalled();
		});

		it("should create new space when no existing space", async () => {
			const ctx = createMockToolContext();

			const result = await getOrCreateSpaceTool.handler({ repository: "acme/my-docs" }, ctx);
			const parsed = JSON.parse(result.content);

			expect(result.success).toBe(true);
			expect(parsed.created).toBe(true);
			expect(parsed.spaceId).toBe(2);
			expect(ctx.spaceDao.createSpace).toHaveBeenCalledOnce();
			expect(ctx.spaceDao.createSpace).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "my-docs",
					slug: "my-docs",
					ownerId: 1,
				}),
			);
		});

		it("should update stepData with space info for existing space", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.spaceDao.getSpaceBySlug).mockResolvedValueOnce({
				id: 5,
				name: "docs",
				slug: "docs",
			} as never);

			await getOrCreateSpaceTool.handler({ repository: "acme/docs" }, ctx);

			expect(ctx.updateStepData).toHaveBeenCalledWith({
				spaceId: 5,
				spaceName: "docs",
			});
		});

		it("should update stepData with space info for new space", async () => {
			const ctx = createMockToolContext();

			await getOrCreateSpaceTool.handler({ repository: "acme/my-docs" }, ctx);

			expect(ctx.updateStepData).toHaveBeenCalledWith({
				spaceId: 2,
				spaceName: "new-space",
			});
		});

		it("should add space to favorites for new space", async () => {
			const ctx = createMockToolContext();

			await getOrCreateSpaceTool.handler({ repository: "acme/my-docs" }, ctx);

			expect(ctx.userPreferenceDao.getPreference).toHaveBeenCalledWith(1);
			expect(ctx.userPreferenceDao.upsertPreference).toHaveBeenCalledWith(1, {
				favoriteSpaces: [2],
			});
		});

		it("should add space to favorites for existing space", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.spaceDao.getSpaceBySlug).mockResolvedValueOnce({
				id: 5,
				name: "docs",
				slug: "docs",
			} as never);

			await getOrCreateSpaceTool.handler({ repository: "acme/docs" }, ctx);

			expect(ctx.userPreferenceDao.getPreference).toHaveBeenCalledWith(1);
			expect(ctx.userPreferenceDao.upsertPreference).toHaveBeenCalledWith(1, {
				favoriteSpaces: [5],
			});
		});

		it("should handle repository in owner/repo format", async () => {
			const ctx = createMockToolContext();

			await getOrCreateSpaceTool.handler({ repository: "my-username/my-project" }, ctx);

			// Should extract "my-project" from "my-username/my-project"
			expect(ctx.spaceDao.getSpaceBySlug).toHaveBeenCalledWith("my-project");
			expect(ctx.spaceDao.createSpace).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "my-project",
					slug: "my-project",
				}),
			);
		});

		it("should handle repository without owner (single name)", async () => {
			const ctx = createMockToolContext();

			await getOrCreateSpaceTool.handler({ repository: "standalone-repo" }, ctx);

			// Should use the name as-is when no "/" is present
			expect(ctx.spaceDao.getSpaceBySlug).toHaveBeenCalledWith("standalone-repo");
			expect(ctx.spaceDao.createSpace).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "standalone-repo",
					slug: "standalone-repo",
				}),
			);
		});

		it("should not add duplicate favorites", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.userPreferenceDao.getPreference).mockResolvedValueOnce({
				favoriteSpaces: [2],
			} as never);

			await getOrCreateSpaceTool.handler({ repository: "acme/my-docs" }, ctx);

			// Space id 2 is already in favorites, so upsertPreference should not be called
			expect(ctx.userPreferenceDao.upsertPreference).not.toHaveBeenCalled();
		});

		it("should handle favoriting errors gracefully", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.userPreferenceDao.getPreference).mockRejectedValueOnce(new Error("Preference DB error"));

			const result = await getOrCreateSpaceTool.handler({ repository: "acme/my-docs" }, ctx);
			const parsed = JSON.parse(result.content);

			// The tool should still succeed even though favoriting failed
			expect(result.success).toBe(true);
			expect(parsed.created).toBe(true);
			expect(parsed.spaceId).toBe(2);
		});

		it("should handle errors gracefully", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.spaceDao.getSpaceBySlug).mockRejectedValueOnce(new Error("DB connection lost"));

			const result = await getOrCreateSpaceTool.handler({ repository: "acme/docs" }, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Failed to get or create space");
			expect(result.content).toContain("DB connection lost");
		});

		it("should handle non-Error objects in catch block", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.spaceDao.getSpaceBySlug).mockRejectedValueOnce("string error");

			const result = await getOrCreateSpaceTool.handler({ repository: "acme/docs" }, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Unknown error");
		});
	});
});
