import { createStorageCheck } from "./StorageCheck";
import type { S3Client } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/Config", () => ({
	getConfig: vi.fn(),
}));

import { getConfig } from "../../config/Config";

describe("StorageCheck", () => {
	let mockS3Client: S3Client;

	beforeEach(() => {
		vi.clearAllMocks();
		mockS3Client = {
			send: vi.fn(),
		} as unknown as S3Client;
	});

	it("returns healthy with latency when bucket is accessible", async () => {
		vi.mocked(getConfig).mockReturnValue({
			IMAGE_S3_ENV: "dev",
		} as ReturnType<typeof getConfig>);
		vi.mocked(mockS3Client.send).mockResolvedValue({} as never);

		const check = createStorageCheck(mockS3Client);
		const result = await check.check();

		expect(result.status).toBe("healthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(result.message).toBeUndefined();
	});

	it("returns unhealthy when bucket is inaccessible", async () => {
		vi.mocked(getConfig).mockReturnValue({
			IMAGE_S3_ENV: "dev",
		} as ReturnType<typeof getConfig>);
		vi.mocked(mockS3Client.send).mockRejectedValue(new Error("Access Denied"));

		const check = createStorageCheck(mockS3Client);
		const result = await check.check();

		expect(result.status).toBe("unhealthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(result.message).toBe("Storage inaccessible");
	});

	it("returns disabled when IMAGE_S3_ENV is not configured", async () => {
		vi.mocked(getConfig).mockReturnValue({
			IMAGE_S3_ENV: undefined,
		} as unknown as ReturnType<typeof getConfig>);

		const check = createStorageCheck(mockS3Client);
		const result = await check.check();

		expect(result.status).toBe("disabled");
		expect(result.message).toBe("Storage not configured");
		expect(mockS3Client.send).not.toHaveBeenCalled();
	});

	it("returns disabled when IMAGE_S3_ENV is 'local'", async () => {
		vi.mocked(getConfig).mockReturnValue({
			IMAGE_S3_ENV: "local",
		} as ReturnType<typeof getConfig>);

		const check = createStorageCheck(mockS3Client);
		const result = await check.check();

		expect(result.status).toBe("disabled");
		expect(result.message).toBe("Storage not configured");
		expect(mockS3Client.send).not.toHaveBeenCalled();
	});

	it("has correct name and critical flag", () => {
		vi.mocked(getConfig).mockReturnValue({
			IMAGE_S3_ENV: "dev",
		} as ReturnType<typeof getConfig>);

		const check = createStorageCheck(mockS3Client);

		expect(check.name).toBe("storage");
		expect(check.critical).toBe(false);
	});
});
