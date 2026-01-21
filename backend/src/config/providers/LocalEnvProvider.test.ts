import { LocalEnvProvider } from "./LocalEnvProvider";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("LocalEnvProvider", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("isAvailable", () => {
		it("always returns true", () => {
			const provider = new LocalEnvProvider();
			expect(provider.isAvailable()).toBe(true);
		});

		it("returns true even when on Vercel", () => {
			process.env.VERCEL = "1";
			const provider = new LocalEnvProvider();
			expect(provider.isAvailable()).toBe(true);
		});

		it("returns true even when PSTORE_ENV is set", () => {
			process.env.PSTORE_ENV = "prod";
			const provider = new LocalEnvProvider();
			expect(provider.isAvailable()).toBe(true);
		});
	});

	describe("load", () => {
		it("loads known Jolli environment variables", async () => {
			process.env.TOKEN_SECRET = "local-secret";
			process.env.POSTGRES_HOST = "localhost";
			process.env.NODE_ENV = "development";

			const provider = new LocalEnvProvider();
			const result = await provider.load();

			expect(result.TOKEN_SECRET).toBe("local-secret");
			expect(result.POSTGRES_HOST).toBe("localhost");
			expect(result.NODE_ENV).toBe("development");
		});

		it("excludes unknown environment variables", async () => {
			process.env.TOKEN_SECRET = "secret123";
			process.env.RANDOM_VAR = "random";
			process.env.HOME = "/home/user";
			process.env.SHELL = "/bin/bash";

			const provider = new LocalEnvProvider();
			const result = await provider.load();

			expect(result.TOKEN_SECRET).toBe("secret123");
			expect(result.RANDOM_VAR).toBeUndefined();
			expect(result.HOME).toBeUndefined();
			expect(result.SHELL).toBeUndefined();
		});

		it("includes variables with all known prefixes", async () => {
			// Set a variety of known prefix variables
			process.env.ANTHROPIC_API_KEY = "sk-ant-xxx";
			process.env.AWS_REGION = "us-west-2";
			process.env.DEV_TOOLS_ENABLED = "true";
			process.env.E2B_API_KEY = "e2b-xxx";
			process.env.GITHUB_TOKEN = "ghp-xxx";
			process.env.GOOGLE_CLIENT_ID = "google-xxx";
			process.env.JOBS_STORE_FOR_DAYS = "30";
			process.env.LLM_PROVIDER = "anthropic";
			process.env.LOG_LEVEL = "debug";
			process.env.MAX_VISIBLE_DRAFTS = "5";
			process.env.MULTI_TENANT_ENABLED = "false";
			process.env.OPENAI_API_KEY = "sk-xxx";
			process.env.ORIGIN = "http://localhost:3000";
			process.env.POSTGRES_DATABASE = "jolli";
			process.env.PSTORE_ENV = "dev";
			process.env.SEQUELIZE = "postgres";
			process.env.SESSION_SECRET = "session-xxx";
			process.env.SMEE_API_URL = "https://smee.io/xxx";
			process.env.TOKEN_ALGORITHM = "HS256";
			process.env.TOOLS_PATH = "../tools";
			process.env.USE_DEVELOPER_TOOLS = "true";
			process.env.VERCEL_TOKEN = "vercel-xxx";

			const provider = new LocalEnvProvider();
			const result = await provider.load();

			expect(result.ANTHROPIC_API_KEY).toBe("sk-ant-xxx");
			expect(result.AWS_REGION).toBe("us-west-2");
			expect(result.DEV_TOOLS_ENABLED).toBe("true");
			expect(result.E2B_API_KEY).toBe("e2b-xxx");
			expect(result.GITHUB_TOKEN).toBe("ghp-xxx");
			expect(result.GOOGLE_CLIENT_ID).toBe("google-xxx");
			expect(result.JOBS_STORE_FOR_DAYS).toBe("30");
			expect(result.LLM_PROVIDER).toBe("anthropic");
			expect(result.LOG_LEVEL).toBe("debug");
			expect(result.MAX_VISIBLE_DRAFTS).toBe("5");
			expect(result.MULTI_TENANT_ENABLED).toBe("false");
			expect(result.OPENAI_API_KEY).toBe("sk-xxx");
			expect(result.ORIGIN).toBe("http://localhost:3000");
			expect(result.POSTGRES_DATABASE).toBe("jolli");
			expect(result.PSTORE_ENV).toBe("dev");
			expect(result.SEQUELIZE).toBe("postgres");
			expect(result.SESSION_SECRET).toBe("session-xxx");
			expect(result.SMEE_API_URL).toBe("https://smee.io/xxx");
			expect(result.TOKEN_ALGORITHM).toBe("HS256");
			expect(result.TOOLS_PATH).toBe("../tools");
			expect(result.USE_DEVELOPER_TOOLS).toBe("true");
			expect(result.VERCEL_TOKEN).toBe("vercel-xxx");
		});

		it("handles variables that match prefix exactly", async () => {
			process.env.NODE_ENV = "test";
			process.env.ORIGIN = "http://test.local";
			process.env.ROOT_PATH = "/api";
			process.env.SEED_DATABASE = "true";
			process.env.SEQUELIZE = "memory";

			const provider = new LocalEnvProvider();
			const result = await provider.load();

			expect(result.NODE_ENV).toBe("test");
			expect(result.ORIGIN).toBe("http://test.local");
			expect(result.ROOT_PATH).toBe("/api");
			expect(result.SEED_DATABASE).toBe("true");
			expect(result.SEQUELIZE).toBe("memory");
		});
	});

	describe("properties", () => {
		it("has correct name", () => {
			const provider = new LocalEnvProvider();
			expect(provider.name).toBe("local-env");
		});

		it("has correct priority (lowest)", () => {
			const provider = new LocalEnvProvider();
			expect(provider.priority).toBe(3);
		});
	});
});
