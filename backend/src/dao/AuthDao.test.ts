import type { Auth, NewAuth } from "../model/Auth";
import { mockAuth } from "../model/Auth.mock";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { type AuthDao, createAuthDao, createAuthDaoProvider } from "./AuthDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("AuthDao", () => {
	let mockAuths: ModelDef<Auth>;
	let authDao: AuthDao;

	beforeEach(() => {
		mockAuths = {
			create: vi.fn(),
			findOne: vi.fn(),
			update: vi.fn(),
		} as unknown as ModelDef<Auth>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockAuths),
		} as unknown as Sequelize;

		authDao = createAuthDao(mockSequelize);
	});

	describe("findAuth", () => {
		it("should return auth when found", async () => {
			const auth = mockAuth({
				id: 1,
				provider: "github",
				subject: "12345",
				email: "test@example.com",
			});

			const mockAuthInstance = {
				get: vi.fn().mockReturnValue(auth),
			};

			vi.mocked(mockAuths.findOne).mockResolvedValue(mockAuthInstance as never);

			const result = await authDao.findAuth("github", "12345");

			expect(mockAuths.findOne).toHaveBeenCalledWith({
				where: { provider: "github", subject: "12345" },
			});
			expect(mockAuthInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(auth);
		});

		it("should return undefined when auth not found", async () => {
			vi.mocked(mockAuths.findOne).mockResolvedValue(null);

			const result = await authDao.findAuth("google", "67890");

			expect(mockAuths.findOne).toHaveBeenCalledWith({
				where: { provider: "google", subject: "67890" },
			});
			expect(result).toBeUndefined();
		});
	});

	describe("createAuth", () => {
		it("should create an auth", async () => {
			const newAuth: NewAuth = {
				provider: "github",
				subject: "12345",
				email: "test@example.com",
				name: "Test User",
				picture: "https://example.com/avatar.jpg",
			};

			const createdAuth = mockAuth({
				...newAuth,
				id: 1,
			});

			const mockAuthInstance = {
				get: vi.fn().mockReturnValue(createdAuth),
			};

			vi.mocked(mockAuths.create).mockResolvedValue(mockAuthInstance as never);

			const result = await authDao.createAuth(newAuth);

			expect(mockAuths.create).toHaveBeenCalledWith(newAuth);
			expect(mockAuthInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(createdAuth);
		});
	});

	describe("updateAuth", () => {
		it("should update an auth", async () => {
			const auth = mockAuth({
				id: 1,
				provider: "github",
				subject: "12345",
				email: "test@example.com",
				name: "Updated Name",
			});

			vi.mocked(mockAuths.update).mockResolvedValue([1] as never);

			const result = await authDao.updateAuth(auth);

			expect(mockAuths.update).toHaveBeenCalledWith(auth, {
				where: { id: 1 },
			});
			expect(result).toEqual(auth);
		});
	});
});

describe("createAuthDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as AuthDao;
		const provider = createAuthDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context authDao when context has database", () => {
		const defaultDao = {} as AuthDao;
		const contextAuthDao = {} as AuthDao;
		const context = {
			database: {
				authDao: contextAuthDao,
			},
		} as TenantOrgContext;

		const provider = createAuthDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextAuthDao);
	});
});
