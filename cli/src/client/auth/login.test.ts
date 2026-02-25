import * as configModule from "./config";
import { createLoginServer } from "./login";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Use vi.spyOn instead of vi.mock to avoid leaking mocks to other test files
// that import from the same "./config" module.

describe("login server", () => {
	let server: Server | null = null;
	let serverPort: number;

	beforeEach(() => {
		// Use a random port for each test
		serverPort = 10000 + Math.floor(Math.random() * 50000);
		vi.spyOn(configModule, "saveAuthToken").mockResolvedValue(undefined);
		vi.spyOn(configModule, "saveSpace").mockResolvedValue(undefined);
	});

	afterEach(() => {
		if (server) {
			server.close();
			server = null;
		}
		vi.restoreAllMocks();
	});

	test("creates server that calls onListen", async () => {
		const onListen = vi.fn();
		const onSuccess = vi.fn();
		const onError = vi.fn();

		server = createLoginServer({
			port: serverPort,
			onListen,
			onSuccess,
			onError,
		});

		// Wait for server to start
		await new Promise(resolve => setTimeout(resolve, 50));

		expect(onListen).toHaveBeenCalledOnce();
	});

	test("returns 404 for non-callback paths", async () => {
		const onListen = vi.fn();
		const onSuccess = vi.fn();
		const onError = vi.fn();

		server = createLoginServer({
			port: serverPort,
			onListen,
			onSuccess,
			onError,
		});

		await new Promise(resolve => setTimeout(resolve, 50));

		const response = await fetch(`http://localhost:${serverPort}/not-callback`);
		expect(response.status).toBe(404);
	});

	test("handles error parameter in callback", async () => {
		const onListen = vi.fn();
		const onSuccess = vi.fn();
		const onError = vi.fn();

		server = createLoginServer({
			port: serverPort,
			onListen,
			onSuccess,
			onError,
		});

		await new Promise(resolve => setTimeout(resolve, 50));

		const response = await fetch(`http://localhost:${serverPort}/callback?error=oauth_failed`);
		expect(response.status).toBe(400);

		// Wait for callback to process
		await new Promise(resolve => setTimeout(resolve, 50));

		expect(onError).toHaveBeenCalled();
		expect(onSuccess).not.toHaveBeenCalled();
	});

	test("handles missing token in callback", async () => {
		const onListen = vi.fn();
		const onSuccess = vi.fn();
		const onError = vi.fn();

		server = createLoginServer({
			port: serverPort,
			onListen,
			onSuccess,
			onError,
		});

		await new Promise(resolve => setTimeout(resolve, 50));

		const response = await fetch(`http://localhost:${serverPort}/callback`);
		expect(response.status).toBe(400);

		await new Promise(resolve => setTimeout(resolve, 50));

		expect(onError).toHaveBeenCalled();
		expect(onSuccess).not.toHaveBeenCalled();
	});

	test("handles valid token in callback", async () => {
		const onListen = vi.fn();
		const onSuccess = vi.fn();
		const onError = vi.fn();

		server = createLoginServer({
			port: serverPort,
			onListen,
			onSuccess,
			onError,
		});

		await new Promise(resolve => setTimeout(resolve, 50));

		const response = await fetch(`http://localhost:${serverPort}/callback?token=valid-token`);
		expect(response.status).toBe(200);

		await new Promise(resolve => setTimeout(resolve, 50));

		expect(onSuccess).toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		expect(configModule.saveAuthToken).toHaveBeenCalledWith("valid-token");
	});

	test("handles valid token with space in callback", async () => {
		const onListen = vi.fn();
		const onSuccess = vi.fn();
		const onError = vi.fn();

		server = createLoginServer({
			port: serverPort,
			onListen,
			onSuccess,
			onError,
		});

		await new Promise(resolve => setTimeout(resolve, 50));

		const response = await fetch(`http://localhost:${serverPort}/callback?token=valid-token&space=default`);
		expect(response.status).toBe(200);

		await new Promise(resolve => setTimeout(resolve, 50));

		expect(onSuccess).toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		expect(configModule.saveAuthToken).toHaveBeenCalledWith("valid-token");
		expect(configModule.saveSpace).toHaveBeenCalledWith("default");
	});

	test("handles different error codes with appropriate messages", async () => {
		const errorCodes = [
			"oauth_failed",
			"session_missing",
			"invalid_provider",
			"auth_fetch_failed",
			"no_verified_emails",
			"server_error",
			"unknown_error",
		];

		for (const errorCode of errorCodes) {
			const onError = vi.fn();
			server = createLoginServer({
				port: serverPort,
				onListen: vi.fn(),
				onSuccess: vi.fn(),
				onError,
			});

			await new Promise(resolve => setTimeout(resolve, 50));

			await fetch(`http://localhost:${serverPort}/callback?error=${errorCode}`);

			await new Promise(resolve => setTimeout(resolve, 50));

			expect(onError).toHaveBeenCalled();

			server.close();
			server = null;
			serverPort++;
		}
	});

	test("handles saveAuthToken failure", async () => {
		// Mock saveAuthToken to throw an error
		(configModule.saveAuthToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Save failed"));

		const onListen = vi.fn();
		const onSuccess = vi.fn();
		const onError = vi.fn();

		server = createLoginServer({
			port: serverPort,
			onListen,
			onSuccess,
			onError,
		});

		await new Promise(resolve => setTimeout(resolve, 50));

		const response = await fetch(`http://localhost:${serverPort}/callback?token=valid-token`);
		expect(response.status).toBe(500);

		await new Promise(resolve => setTimeout(resolve, 50));

		expect(onError).toHaveBeenCalled();
		expect(onSuccess).not.toHaveBeenCalled();
	});

	test("handles non-Error saveAuthToken failure", async () => {
		// Mock saveAuthToken to throw a non-Error
		(configModule.saveAuthToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce("String error");

		const onListen = vi.fn();
		const onSuccess = vi.fn();
		const onError = vi.fn();

		server = createLoginServer({
			port: serverPort,
			onListen,
			onSuccess,
			onError,
		});

		await new Promise(resolve => setTimeout(resolve, 50));

		const response = await fetch(`http://localhost:${serverPort}/callback?token=valid-token`);
		expect(response.status).toBe(500);

		await new Promise(resolve => setTimeout(resolve, 50));

		expect(onError).toHaveBeenCalled();
		expect(onSuccess).not.toHaveBeenCalled();
	});
});
