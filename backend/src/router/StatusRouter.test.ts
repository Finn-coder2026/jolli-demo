import { createStatusRouter } from "./StatusRouter";
import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

describe("StatusRouter", () => {
	let app: Express;

	function setupApp(): void {
		app = express();
		app.use("/status", createStatusRouter());
	}

	beforeEach(() => {
		setupApp();
	});

	it("should return 'OK' on GET /check", async () => {
		const response = await request(app).get("/status/check");

		expect(response.status).toBe(200);
		expect(response.text).toBe("OK");
	});

	it("should have correct content-type header", async () => {
		const response = await request(app).get("/status/check");

		expect(response.headers["content-type"]).toMatch(/text\/html/);
	});
});
