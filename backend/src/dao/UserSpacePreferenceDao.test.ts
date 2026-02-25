import type { UserSpacePreference } from "../model/UserSpacePreference";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import {
	createUserSpacePreferenceDao,
	createUserSpacePreferenceDaoProvider,
	type UserSpacePreferenceDao,
} from "./UserSpacePreferenceDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

function mockPreference(partial?: Partial<UserSpacePreference>): UserSpacePreference {
	return {
		id: 1,
		userId: 1,
		spaceId: 1,
		sort: "alphabetical_asc",
		filters: { updated: "any_time", creator: "" },
		expandedFolders: [],
		updatedAt: new Date(0),
		...partial,
	};
}

describe("UserSpacePreferenceDao", () => {
	let mockPreferences: ModelDef<UserSpacePreference>;
	let userSpacePreferenceDao: UserSpacePreferenceDao;

	beforeEach(() => {
		mockPreferences = {
			create: vi.fn(),
			findOne: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<UserSpacePreference>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockPreferences),
		} as unknown as Sequelize;

		userSpacePreferenceDao = createUserSpacePreferenceDao(mockSequelize);
	});

	describe("getPreference", () => {
		it("should return preference when found", async () => {
			const pref = mockPreference({ userId: 1, spaceId: 2 });

			vi.mocked(mockPreferences.findOne).mockResolvedValue({
				get: vi.fn().mockReturnValue(pref),
			} as never);

			const result = await userSpacePreferenceDao.getPreference(1, 2);

			expect(mockPreferences.findOne).toHaveBeenCalledWith({
				where: { userId: 1, spaceId: 2 },
			});
			expect(result).toEqual(pref);
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockPreferences.findOne).mockResolvedValue(null);

			const result = await userSpacePreferenceDao.getPreference(999, 888);

			expect(result).toBeUndefined();
		});
	});

	describe("upsertPreference", () => {
		it("should update existing preference with sort", async () => {
			const existingPref = mockPreference({ userId: 1, spaceId: 2, sort: "default" });
			const updateMock = vi.fn().mockResolvedValue(undefined);
			const getMock = vi.fn().mockReturnValue({ ...existingPref, sort: "alphabetical_desc" });

			vi.mocked(mockPreferences.findOne).mockResolvedValue({
				update: updateMock,
				get: getMock,
			} as never);

			const result = await userSpacePreferenceDao.upsertPreference(1, 2, { sort: "alphabetical_desc" });

			expect(mockPreferences.findOne).toHaveBeenCalledWith({
				where: { userId: 1, spaceId: 2 },
			});
			expect(updateMock).toHaveBeenCalledWith({
				userId: 1,
				spaceId: 2,
				sort: "alphabetical_desc",
			});
			expect(result.sort).toBe("alphabetical_desc");
		});

		it("should update existing preference with filters", async () => {
			const existingPref = mockPreference({ userId: 1, spaceId: 2 });
			const updateMock = vi.fn().mockResolvedValue(undefined);
			const newFilters = { showDrafts: true };
			const getMock = vi.fn().mockReturnValue({ ...existingPref, filters: newFilters });

			vi.mocked(mockPreferences.findOne).mockResolvedValue({
				update: updateMock,
				get: getMock,
			} as never);

			const result = await userSpacePreferenceDao.upsertPreference(1, 2, { filters: newFilters });

			expect(updateMock).toHaveBeenCalledWith({
				userId: 1,
				spaceId: 2,
				filters: newFilters,
			});
			expect(result.filters).toEqual(newFilters);
		});

		it("should update existing preference with expandedFolders", async () => {
			const existingPref = mockPreference({ userId: 1, spaceId: 2 });
			const updateMock = vi.fn().mockResolvedValue(undefined);
			const newFolders = [1, 2, 3];
			const getMock = vi.fn().mockReturnValue({ ...existingPref, expandedFolders: newFolders });

			vi.mocked(mockPreferences.findOne).mockResolvedValue({
				update: updateMock,
				get: getMock,
			} as never);

			const result = await userSpacePreferenceDao.upsertPreference(1, 2, { expandedFolders: newFolders });

			expect(updateMock).toHaveBeenCalledWith({
				userId: 1,
				spaceId: 2,
				expandedFolders: newFolders,
			});
			expect(result.expandedFolders).toEqual(newFolders);
		});

		it("should update existing preference with null sort to clear stored value", async () => {
			const existingPref = mockPreference({ userId: 1, spaceId: 2, sort: "alphabetical_asc" });
			const updateMock = vi.fn().mockResolvedValue(undefined);
			const getMock = vi.fn().mockReturnValue({ ...existingPref, sort: null });

			vi.mocked(mockPreferences.findOne).mockResolvedValue({
				update: updateMock,
				get: getMock,
			} as never);

			await userSpacePreferenceDao.upsertPreference(1, 2, { sort: null });

			expect(updateMock).toHaveBeenCalledWith({
				userId: 1,
				spaceId: 2,
				sort: null,
			});
		});

		it("should create new preference when not existing", async () => {
			const newPref = mockPreference({ userId: 1, spaceId: 2, sort: "alphabetical_asc" });

			vi.mocked(mockPreferences.findOne).mockResolvedValue(null);
			vi.mocked(mockPreferences.create).mockResolvedValue({
				get: vi.fn().mockReturnValue(newPref),
			} as never);

			const result = await userSpacePreferenceDao.upsertPreference(1, 2, { sort: "alphabetical_asc" });

			expect(mockPreferences.create).toHaveBeenCalledWith({
				userId: 1,
				spaceId: 2,
				sort: "alphabetical_asc",
				filters: undefined,
				expandedFolders: [],
			});
			expect(result).toEqual(newPref);
		});

		it("should create new preference with expandedFolders when provided", async () => {
			const newPref = mockPreference({ userId: 1, spaceId: 2, expandedFolders: [1, 2, 3] });

			vi.mocked(mockPreferences.findOne).mockResolvedValue(null);
			vi.mocked(mockPreferences.create).mockResolvedValue({
				get: vi.fn().mockReturnValue(newPref),
			} as never);

			const result = await userSpacePreferenceDao.upsertPreference(1, 2, { expandedFolders: [1, 2, 3] });

			expect(mockPreferences.create).toHaveBeenCalledWith({
				userId: 1,
				spaceId: 2,
				sort: undefined,
				filters: undefined,
				expandedFolders: [1, 2, 3],
			});
			expect(result.expandedFolders).toEqual([1, 2, 3]);
		});
	});

	describe("deletePreference", () => {
		it("should delete preference", async () => {
			vi.mocked(mockPreferences.destroy).mockResolvedValue(1 as never);

			await userSpacePreferenceDao.deletePreference(1, 2);

			expect(mockPreferences.destroy).toHaveBeenCalledWith({
				where: { userId: 1, spaceId: 2 },
			});
		});

		it("should not throw when preference does not exist", async () => {
			vi.mocked(mockPreferences.destroy).mockResolvedValue(0 as never);

			await expect(userSpacePreferenceDao.deletePreference(999, 888)).resolves.toBeUndefined();
		});
	});
});

describe("UserSpacePreferenceDaoProvider", () => {
	it("should return default dao when context is undefined", () => {
		const defaultDao = {} as UserSpacePreferenceDao;
		const provider = createUserSpacePreferenceDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context dao when available", () => {
		const defaultDao = {} as UserSpacePreferenceDao;
		const contextDao = {} as UserSpacePreferenceDao;
		const provider = createUserSpacePreferenceDaoProvider(defaultDao);

		const context = {
			database: {
				userSpacePreferenceDao: contextDao,
			},
		} as unknown as TenantOrgContext;

		const result = provider.getDao(context);

		expect(result).toBe(contextDao);
	});

	it("should return default dao when context has no userSpacePreferenceDao", () => {
		const defaultDao = {} as UserSpacePreferenceDao;
		const provider = createUserSpacePreferenceDaoProvider(defaultDao);

		const context = {
			database: {},
		} as unknown as TenantOrgContext;

		const result = provider.getDao(context);

		expect(result).toBe(defaultDao);
	});
});
