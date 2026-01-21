import type { DaoProvider } from "../dao/DaoProvider";
import type { VisitDao } from "../dao/VisitDao";
import { mockVisitDao } from "../dao/VisitDao.mock";
import { createTokenUtil } from "../util/TokenUtil";
import { createVisitRouter } from "./VisitRouter";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

vi.mock("../util/Cookies", () => ({
	issueVisitorCookie: vi.fn(() => "test-visitor-id"),
}));

describe("VisitRouter", () => {
	let app: Express;
	let mockDao: VisitDao;

	beforeEach(() => {
		mockDao = mockVisitDao({
			createVisit: vi.fn().mockResolvedValue({ id: 1, date: new Date(), visitorId: "test-visitor-id" }),
		});
		app = express();
		app.use(cookieParser());
		app.use(
			"/visit",
			createVisitRouter(
				mockDaoProvider(mockDao),
				createTokenUtil("test-secret", { expiresIn: "1h", algorithm: "HS256" }),
			),
		);
	});

	it("should create a visit on POST /visit", async () => {
		const { issueVisitorCookie } = vi.mocked(await import("../util/Cookies"));

		const response = await request(app).post("/visit/create");

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ success: true });
		expect(issueVisitorCookie).toHaveBeenCalledWith(expect.objectContaining({}), expect.objectContaining({}));
		expect(mockDao.createVisit).toHaveBeenCalledWith({ visitorId: "test-visitor-id" });
	});

	it("should handle database errors gracefully", async () => {
		mockDao.createVisit = vi.fn().mockRejectedValue(new Error("Database error"));

		const response = await request(app).post("/visit/create");

		expect(response.status).toBe(500);
	});

	it("should have correct content-type header", async () => {
		const response = await request(app).post("/visit/create");

		expect(response.headers["content-type"]).toMatch(/json/);
	});

	it("should create a visit with userId when authenticated via cookie", async () => {
		const tokenUtil = createTokenUtil("test-secret", { expiresIn: "1h", algorithm: "HS256" });
		const token = tokenUtil.generateToken({
			userId: "123",
			email: "test@example.com",
			name: "Test User",
			picture: undefined,
		});

		const response = await request(app).post("/visit/create").set("Cookie", `authToken=${token}`);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ success: true });
		expect(mockDao.createVisit).toHaveBeenCalledWith({ visitorId: "test-visitor-id", userId: "123" });
	});
});
