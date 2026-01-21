import type { Visit } from "../model/Visit";
import { mockVisit } from "../model/Visit.mock";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { createVisitDao, createVisitDaoProvider, type VisitDao } from "./VisitDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("VisitDao", () => {
	let mockVisits: ModelDef<Visit>;
	let visitDao: VisitDao;

	beforeEach(() => {
		mockVisits = {
			create: vi.fn(),
		} as unknown as ModelDef<Visit>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockVisits),
		} as unknown as Sequelize;

		visitDao = createVisitDao(mockSequelize);
	});

	describe("createVisit", () => {
		it("should create a visit", async () => {
			const newVisit = mockVisit({
				id: 1,
				visitorId: "visitor:123",
			});

			vi.mocked(mockVisits.create).mockResolvedValue(newVisit as never);

			const result = await visitDao.createVisit(newVisit);

			expect(mockVisits.create).toHaveBeenCalledWith(newVisit);
			expect(result).toEqual(newVisit);
		});

		it("should create visit with different visitor id", async () => {
			const newVisit = mockVisit({
				id: 2,
				visitorId: "visitor:456",
			});

			vi.mocked(mockVisits.create).mockResolvedValue(newVisit as never);

			const result = await visitDao.createVisit(newVisit);

			expect(result).toEqual(newVisit);
		});
	});
});

describe("createVisitDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as VisitDao;
		const provider = createVisitDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context visitDao when context has database", () => {
		const defaultDao = {} as VisitDao;
		const contextVisitDao = {} as VisitDao;
		const context = {
			database: {
				visitDao: contextVisitDao,
			},
		} as TenantOrgContext;

		const provider = createVisitDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextVisitDao);
	});
});
