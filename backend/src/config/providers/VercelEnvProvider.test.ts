import { VercelEnvProvider } from "./VercelEnvProvider";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("VercelEnvProvider", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("isAvailable", () => {
		it("returns true when VERCEL=1", () => {
			process.env.VERCEL = "1";
			const provider = new VercelEnvProvider();
			expect(provider.isAvailable()).toBe(true);
		});

		it("returns false when VERCEL is not set", () => {
			delete process.env.VERCEL;
			const provider = new VercelEnvProvider();
			expect(provider.isAvailable()).toBe(false);
		});

		it("returns false when VERCEL is not '1'", () => {
			process.env.VERCEL = "true";
			const provider = new VercelEnvProvider();
			expect(provider.isAvailable()).toBe(false);
		});
	});

	describe("load", () => {
		it("returns empty object when not running on Vercel", async () => {
			delete process.env.VERCEL;
			const provider = new VercelEnvProvider();
			const result = await provider.load();
			expect(result).toEqual({});
		});

		it("loads known Jolli environment variables", async () => {
			process.env.VERCEL = "1";
			process.env.TOKEN_SECRET = "secret123";
			process.env.POSTGRES_HOST = "db.example.com";
			process.env.NODE_ENV = "production";

			const provider = new VercelEnvProvider();
			const result = await provider.load();

			expect(result.TOKEN_SECRET).toBe("secret123");
			expect(result.POSTGRES_HOST).toBe("db.example.com");
			expect(result.NODE_ENV).toBe("production");
		});

		it("excludes unknown environment variables", async () => {
			process.env.VERCEL = "1";
			process.env.TOKEN_SECRET = "secret123";
			process.env.RANDOM_VAR = "random";
			process.env.PATH = "/usr/bin";

			const provider = new VercelEnvProvider();
			const result = await provider.load();

			expect(result.TOKEN_SECRET).toBe("secret123");
			expect(result.RANDOM_VAR).toBeUndefined();
			expect(result.PATH).toBeUndefined();
		});

		it("includes variables with known prefixes", async () => {
			process.env.VERCEL = "1";
			process.env.ANTHROPIC_API_KEY = "sk-ant-xxx";
			process.env.GITHUB_CLIENT_ID = "client123";
			process.env.OPENAI_API_KEY = "sk-xxx";
			process.env.AWS_REGION = "us-west-2";
			process.env.LOG_LEVEL = "debug";
			process.env.MULTI_TENANT_ENABLED = "true";

			const provider = new VercelEnvProvider();
			const result = await provider.load();

			expect(result.ANTHROPIC_API_KEY).toBe("sk-ant-xxx");
			expect(result.GITHUB_CLIENT_ID).toBe("client123");
			expect(result.OPENAI_API_KEY).toBe("sk-xxx");
			expect(result.AWS_REGION).toBe("us-west-2");
			expect(result.LOG_LEVEL).toBe("debug");
			expect(result.MULTI_TENANT_ENABLED).toBe("true");
		});
	});

	describe("properties", () => {
		it("has correct name", () => {
			const provider = new VercelEnvProvider();
			expect(provider.name).toBe("vercel-env");
		});

		it("has correct priority", () => {
			const provider = new VercelEnvProvider();
			expect(provider.priority).toBe(2);
		});
	});
});
