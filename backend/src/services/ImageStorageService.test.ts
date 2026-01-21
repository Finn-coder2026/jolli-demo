import { createImageStorageService } from "./ImageStorageService";
import { Readable } from "node:stream";
import type { S3Client } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the config module
const mockConfig = {
	IMAGE_S3_ENV: "test",
	IMAGE_S3_REGION: "us-west-2",
	AWS_REGION: "us-west-2",
	IMAGE_SIGNED_URL_EXPIRY_SECONDS: 900,
};

vi.mock("../config/Config", () => ({
	getConfig: vi.fn(() => mockConfig),
}));

// Mock the s3-request-presigner
vi.mock("@aws-sdk/s3-request-presigner", () => ({
	getSignedUrl: vi.fn(() => Promise.resolve("https://s3.example.com/signed-url")),
}));

// Mock randomUUID
vi.mock("node:crypto", () => ({
	randomUUID: vi.fn(() => "test-uuid-1234"),
}));

describe("ImageStorageService", () => {
	let mockS3Client: S3Client;
	let sendMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();

		// Reset config to default
		mockConfig.IMAGE_S3_REGION = "us-west-2";

		// Create a mock S3 client
		sendMock = vi.fn();
		mockS3Client = {
			send: sendMock,
		} as unknown as S3Client;
	});

	describe("uploadImage", () => {
		it("should upload image to S3 with correct bucket name and key structure", async () => {
			// Mock HeadBucket to succeed (bucket exists) and PutObject
			sendMock
				.mockResolvedValueOnce({}) // HeadBucket
				.mockResolvedValueOnce({}); // PutObject

			const service = createImageStorageService(mockS3Client);
			const buffer = Buffer.from("test image data");

			const result = await service.uploadImage("1", "100", buffer, "image/png", "png", "test.png");

			// Key should be tenantId/orgId/_default/uuid.ext
			expect(result.imageId).toBe("1/100/_default/test-uuid-1234.png");
			expect(result.bucket).toBe("jolli-images-test");
			expect(result.key).toBe("1/100/_default/test-uuid-1234.png");
			expect(result.mimeType).toBe("image/png");
			expect(result.size).toBe(buffer.length);
		});

		it("should use existing bucket if it exists", async () => {
			// Mock HeadBucket to succeed (bucket exists)
			sendMock
				.mockResolvedValueOnce({}) // HeadBucket
				.mockResolvedValueOnce({}); // PutObject

			const service = createImageStorageService(mockS3Client);
			const buffer = Buffer.from("test image data");

			await service.uploadImage("1", "100", buffer, "image/jpeg", "jpg");

			// Should not call CreateBucket
			expect(sendMock).toHaveBeenCalledTimes(2);
		});

		it("should cache bucket existence check", async () => {
			sendMock
				.mockResolvedValueOnce({}) // First HeadBucket
				.mockResolvedValueOnce({}) // First PutObject
				.mockResolvedValueOnce({}); // Second PutObject

			const service = createImageStorageService(mockS3Client);
			const buffer = Buffer.from("test");

			await service.uploadImage("1", "100", buffer, "image/png", "png");
			await service.uploadImage("1", "100", buffer, "image/png", "png");

			// HeadBucket should only be called once due to caching
			expect(sendMock).toHaveBeenCalledTimes(3);
		});

		it("should store original filename in metadata when provided", async () => {
			sendMock
				.mockResolvedValueOnce({}) // HeadBucket
				.mockResolvedValueOnce({}); // PutObject

			const service = createImageStorageService(mockS3Client);
			const buffer = Buffer.from("test");

			await service.uploadImage("1", "100", buffer, "image/png", "png", "my-screenshot.png");

			// Check the PutObject call has the metadata
			const putObjectCall = sendMock.mock.calls[1][0];
			expect(putObjectCall.input.Metadata).toEqual({ "original-filename": "my-screenshot.png" });
		});

		it("should use correct key structure with tenantId/orgId/_default prefix", async () => {
			sendMock
				.mockResolvedValueOnce({}) // HeadBucket
				.mockResolvedValueOnce({}); // PutObject

			const service = createImageStorageService(mockS3Client);
			const buffer = Buffer.from("test");

			await service.uploadImage("42", "99", buffer, "image/png", "png");

			// Check the PutObject call has the correct key
			const putObjectCall = sendMock.mock.calls[1][0];
			expect(putObjectCall.input.Key).toBe("42/99/_default/test-uuid-1234.png");
			expect(putObjectCall.input.Bucket).toBe("jolli-images-test");
		});
	});

	describe("getSignedUrl", () => {
		it("should generate signed URL for image", async () => {
			sendMock.mockResolvedValueOnce({}); // HeadBucket (for bucket verification cache)

			const service = createImageStorageService(mockS3Client);

			// Pre-verify bucket
			await service.uploadImage("1", "100", Buffer.from("test"), "image/png", "png");

			const url = await service.getSignedUrl("1/100/_default/test-image.png");

			expect(url).toBe("https://s3.example.com/signed-url");
		});

		it("should use custom expiry when provided", async () => {
			const { getSignedUrl: mockGetSignedUrl } = await import("@aws-sdk/s3-request-presigner");

			sendMock.mockResolvedValue({});

			const service = createImageStorageService(mockS3Client);
			await service.getSignedUrl("1/100/_default/test.png", { expiresIn: 300 });

			expect(mockGetSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), { expiresIn: 300 });
		});

		it("should use attachment content disposition when requested", async () => {
			sendMock.mockResolvedValue({});

			const service = createImageStorageService(mockS3Client);
			await service.getSignedUrl("1/100/_default/test.png", { contentDisposition: "attachment" });

			const { getSignedUrl: mockGetSignedUrl } = await import("@aws-sdk/s3-request-presigner");
			const calls = vi.mocked(mockGetSignedUrl).mock.calls;
			const commandArg = calls[calls.length - 1][1] as { input: { ResponseContentDisposition?: string } };

			expect(commandArg.input.ResponseContentDisposition).toBe("attachment");
		});

		it("should use inline content disposition by default", async () => {
			sendMock.mockResolvedValue({});

			const service = createImageStorageService(mockS3Client);
			await service.getSignedUrl("1/100/_default/test.png");

			const { getSignedUrl: mockGetSignedUrl } = await import("@aws-sdk/s3-request-presigner");
			const calls = vi.mocked(mockGetSignedUrl).mock.calls;
			const commandArg = calls[calls.length - 1][1] as { input: { ResponseContentDisposition?: string } };

			expect(commandArg.input.ResponseContentDisposition).toBe("inline");
		});

		it("should use inline content disposition when explicitly set", async () => {
			sendMock.mockResolvedValue({});

			const service = createImageStorageService(mockS3Client);
			await service.getSignedUrl("1/100/_default/test.png", { contentDisposition: "inline" });

			const { getSignedUrl: mockGetSignedUrl } = await import("@aws-sdk/s3-request-presigner");
			const calls = vi.mocked(mockGetSignedUrl).mock.calls;
			const commandArg = calls[calls.length - 1][1] as { input: { ResponseContentDisposition?: string } };

			expect(commandArg.input.ResponseContentDisposition).toBe("inline");
		});
	});

	describe("downloadImage", () => {
		it("should download image from S3", async () => {
			const imageData = Buffer.from("image binary data");

			// Create a readable stream from the buffer
			const stream = new Readable();
			stream.push(imageData);
			stream.push(null);

			sendMock.mockResolvedValueOnce({
				Body: stream,
				ContentType: "image/png",
			});

			const service = createImageStorageService(mockS3Client);
			const result = await service.downloadImage("1/100/_default/test-uuid.png");

			expect(result.buffer).toEqual(imageData);
			expect(result.mimeType).toBe("image/png");

			// Verify the correct bucket and key were used
			const getObjectCall = sendMock.mock.calls[0][0];
			expect(getObjectCall.input.Bucket).toBe("jolli-images-test");
			expect(getObjectCall.input.Key).toBe("1/100/_default/test-uuid.png");
		});

		it("should use default mime type if not returned", async () => {
			const stream = new Readable();
			stream.push(Buffer.from("data"));
			stream.push(null);

			sendMock.mockResolvedValueOnce({
				Body: stream,
				// No ContentType
			});

			const service = createImageStorageService(mockS3Client);
			const result = await service.downloadImage("1/100/_default/test.png");

			expect(result.mimeType).toBe("application/octet-stream");
		});
	});

	describe("deleteImage", () => {
		it("should delete image from S3", async () => {
			sendMock.mockResolvedValueOnce({});

			const service = createImageStorageService(mockS3Client);
			await service.deleteImage("1/100/_default/test-uuid.png");

			expect(sendMock).toHaveBeenCalledTimes(1);
			const deleteCall = sendMock.mock.calls[0][0];
			expect(deleteCall.input.Bucket).toBe("jolli-images-test");
			expect(deleteCall.input.Key).toBe("1/100/_default/test-uuid.png");
		});
	});

	describe("imageExists", () => {
		it("should return true if image exists", async () => {
			sendMock.mockResolvedValueOnce({
				Body: new Readable(),
			});

			const service = createImageStorageService(mockS3Client);
			const exists = await service.imageExists("1/100/_default/test.png");

			expect(exists).toBe(true);
		});

		it("should return false if image does not exist", async () => {
			sendMock.mockRejectedValueOnce({ name: "NoSuchKey" });

			const service = createImageStorageService(mockS3Client);
			const exists = await service.imageExists("1/100/_default/nonexistent.png");

			expect(exists).toBe(false);
		});

		it("should return false for NotFound error", async () => {
			sendMock.mockRejectedValueOnce({ name: "NotFound" });

			const service = createImageStorageService(mockS3Client);
			const exists = await service.imageExists("1/100/_default/nonexistent.png");

			expect(exists).toBe(false);
		});

		it("should return false for NoSuchBucket error", async () => {
			sendMock.mockRejectedValueOnce({ name: "NoSuchBucket" });

			const service = createImageStorageService(mockS3Client);
			const exists = await service.imageExists("1/100/_default/test.png");

			expect(exists).toBe(false);
		});

		it("should return false for 404 httpStatusCode", async () => {
			sendMock.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });

			const service = createImageStorageService(mockS3Client);
			const exists = await service.imageExists("1/100/_default/test.png");

			expect(exists).toBe(false);
		});

		it("should throw for other errors", async () => {
			sendMock.mockRejectedValueOnce(new Error("Network error"));

			const service = createImageStorageService(mockS3Client);

			await expect(service.imageExists("1/100/_default/test.png")).rejects.toThrow("Network error");
		});

		it("should throw when error is null or non-object", async () => {
			// Test with null error
			sendMock.mockRejectedValueOnce(null);

			const service = createImageStorageService(mockS3Client);

			await expect(service.imageExists("1/100/_default/test.png")).rejects.toBe(null);
		});

		it("should throw when error is a string", async () => {
			// Test with string error
			sendMock.mockRejectedValueOnce("string error");

			const service = createImageStorageService(mockS3Client);

			await expect(service.imageExists("1/100/_default/test.png")).rejects.toBe("string error");
		});
	});

	describe("bucket verification", () => {
		it("should throw error when bucket does not exist", async () => {
			sendMock.mockRejectedValueOnce({ name: "NotFound" }); // HeadBucket

			const service = createImageStorageService(mockS3Client);

			await expect(service.uploadImage("1", "100", Buffer.from("test"), "image/png", "png")).rejects.toThrow(
				"S3 bucket 'jolli-images-test' does not exist",
			);
		});

		it("should rethrow non-NotFound errors from HeadBucket", async () => {
			sendMock.mockRejectedValueOnce(new Error("Access Denied"));

			const service = createImageStorageService(mockS3Client);

			await expect(service.uploadImage("1", "100", Buffer.from("test"), "image/png", "png")).rejects.toThrow(
				"Access Denied",
			);
		});
	});

	describe("region configuration", () => {
		it("should use IMAGE_S3_REGION when set", async () => {
			mockConfig.IMAGE_S3_REGION = "eu-west-1";

			sendMock
				.mockResolvedValueOnce({}) // HeadBucket
				.mockResolvedValueOnce({}); // PutObject

			const service = createImageStorageService(mockS3Client);
			await service.uploadImage("1", "100", Buffer.from("test"), "image/png", "png");

			// Service should work correctly with the configured region
			expect(sendMock).toHaveBeenCalledTimes(2);
		});

		it("should fallback to AWS_REGION when IMAGE_S3_REGION is undefined", async () => {
			delete (mockConfig as { IMAGE_S3_REGION?: string }).IMAGE_S3_REGION;

			sendMock
				.mockResolvedValueOnce({}) // HeadBucket
				.mockResolvedValueOnce({}); // PutObject

			const service = createImageStorageService(mockS3Client);
			await service.uploadImage("1", "100", Buffer.from("test"), "image/png", "png");

			// Service should work correctly with the fallback region
			expect(sendMock).toHaveBeenCalledTimes(2);
		});
	});
});
