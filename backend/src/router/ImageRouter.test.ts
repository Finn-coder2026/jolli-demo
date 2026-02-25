import type { Database } from "../core/Database";
import type { AssetDao } from "../dao/AssetDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { SpaceDao } from "../dao/SpaceDao";
import type { Asset } from "../model/Asset";
import type { Space } from "../model/Space";
import type { ImageStorageService } from "../services/ImageStorageService";
import { createTenantOrgContext, runWithTenantContext } from "../tenant/TenantContext";
import { createAuthHandler } from "../util/AuthHandler";
import { createTokenUtil } from "../util/TokenUtil";
import { createImageRouter, createPayloadTooLargeHandler } from "./ImageRouter";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import type { Org, Tenant, UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

function mockAsset(overrides: Partial<Asset> = {}): Asset {
	return {
		id: 1,
		s3Key: "123/456/_default/test-uuid-1234.png",
		assetType: "image",
		mimeType: "image/png",
		size: 1234,
		originalFilename: null,
		uploadedBy: 1,
		status: "active",
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
		deletedAt: null,
		orphanedAt: null,
		spaceId: null,
		...overrides,
	};
}

function mockSpace(overrides: Partial<Space> = {}): Space {
	return {
		id: 10,
		name: "Test Space",
		slug: "test-space",
		jrn: "jrn:space:test-space",
		description: "A test space",
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: { updated: "any_time", creator: "" },
		deletedAt: undefined,
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
		...overrides,
	};
}

// Mock the config module with all necessary fields
vi.mock("../config/Config", () => ({
	getConfig: vi.fn(() => ({
		IMAGE_MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
		AUTH_EMAILS: "*", // Allow all emails
		SUPER_ADMIN_EMAILS: "",
		USE_MULTI_TENANT_AUTH: false,
		TOKEN_EXPIRY: "1h",
		TOKEN_REFRESH_WINDOW: "15m",
	})),
}));

// Mock the AuthGateway module
vi.mock("../auth/AuthGateway", () => ({
	isMultiTenantAuthEnabled: vi.fn(() => false),
}));

// Helper to create mock tenant
function createMockTenant(overrides: Partial<Tenant> = {}): Tenant {
	return {
		id: "123",
		slug: "acme",
		displayName: "Acme Corp",
		status: "active",
		deploymentType: "shared",
		databaseProviderId: "provider-123",
		configs: {},
		configsUpdatedAt: null,
		featureFlags: {},
		primaryDomain: null,
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
		provisionedAt: new Date("2024-01-01"),
		...overrides,
	};
}

function createMockOrg(overrides: Partial<Org> = {}): Org {
	return {
		id: "456",
		tenantId: "123",
		slug: "default",
		displayName: "Default Org",
		schemaName: "org_default",
		status: "active",
		isDefault: true,
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
		...overrides,
	};
}

function createMockDatabase(): Database {
	return {} as Database;
}

describe("ImageRouter", () => {
	let app: Express;
	let mockImageStorageService: ImageStorageService;
	let mockAssetDao: AssetDao;
	let mockAssetDaoProvider: DaoProvider<AssetDao>;
	let mockSpaceDao: SpaceDao;
	let mockSpaceDaoProvider: DaoProvider<SpaceDao>;
	let authToken: string;

	const tokenUtil = createTokenUtil<UserInfo>("test-secret", {
		algorithm: "HS256",
		expiresIn: "1h",
	});

	// PNG magic bytes for tests
	const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

	beforeEach(() => {
		vi.clearAllMocks();

		// Create mock image storage service
		mockImageStorageService = {
			uploadImage: vi.fn().mockResolvedValue({
				imageId: "123/456/_default/test-uuid-1234.png",
				bucket: "jolli-images-test",
				key: "123/456/_default/test-uuid-1234.png",
				mimeType: "image/png",
				size: 1234,
			}),
			getSignedUrl: vi.fn().mockResolvedValue("https://s3.example.com/signed-url"),
			downloadImage: vi.fn().mockResolvedValue({
				buffer: Buffer.from("image data"),
				mimeType: "image/png",
			}),
			deleteImage: vi.fn().mockResolvedValue(undefined),
			imageExists: vi.fn().mockResolvedValue(true),
		};

		// Create mock asset DAO
		mockAssetDao = {
			createAsset: vi.fn().mockResolvedValue(mockAsset()),
			findByS3Key: vi.fn().mockResolvedValue(mockAsset()),
			findByS3KeyWithSpaceAccess: vi.fn().mockResolvedValue(mockAsset()),
			findById: vi.fn().mockResolvedValue(mockAsset()),
			listAssets: vi.fn().mockResolvedValue([mockAsset()]),
			listByUploader: vi.fn().mockResolvedValue([mockAsset()]),
			updateStatus: vi.fn().mockResolvedValue(mockAsset()),
			softDelete: vi.fn().mockResolvedValue(true),
			hardDelete: vi.fn().mockResolvedValue(true),
			deleteAll: vi.fn().mockResolvedValue(undefined),
			listActiveAssets: vi.fn().mockResolvedValue([mockAsset()]),
			markAsOrphaned: vi.fn().mockResolvedValue(0),
			restoreToActive: vi.fn().mockResolvedValue(0),
			findOrphanedOlderThan: vi.fn().mockResolvedValue([]),
			findRecentlyUploaded: vi.fn().mockResolvedValue([]),
		};

		// Create mock asset DAO provider
		mockAssetDaoProvider = {
			getDao: vi.fn().mockReturnValue(mockAssetDao),
		};

		// Create mock space DAO
		mockSpaceDao = {
			createSpace: vi.fn().mockResolvedValue(mockSpace()),
			getSpace: vi.fn().mockResolvedValue(mockSpace()),
			getSpaceByJrn: vi.fn().mockResolvedValue(mockSpace()),
			getSpaceBySlug: vi.fn().mockResolvedValue(mockSpace()),
			listSpaces: vi.fn().mockResolvedValue([mockSpace()]),
			updateSpace: vi.fn().mockResolvedValue(mockSpace()),
			deleteSpace: vi.fn().mockResolvedValue(true),
		} as unknown as SpaceDao;

		// Create mock space DAO provider
		mockSpaceDaoProvider = {
			getDao: vi.fn().mockReturnValue(mockSpaceDao),
		};

		app = express();
		app.use(cookieParser());

		const authHandler = createAuthHandler(tokenUtil);
		app.use(
			"/images",
			authHandler,
			createImageRouter(mockImageStorageService, mockAssetDaoProvider, mockSpaceDaoProvider, tokenUtil),
		);

		// Add error handler to catch any uncaught errors and return JSON
		app.use(
			(
				err: Error,
				_req: express.Request,
				res: express.Response,
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				_next: express.NextFunction,
			) => {
				console.error("Test error handler caught:", err);
				res.status(500).json({ error: err.message });
			},
		);

		// Generate valid auth token
		authToken = tokenUtil.generateToken({
			userId: 1,
			name: "Test User",
			email: "test@acme.com",
			picture: "https://example.com/pic.jpg",
		});
	});

	describe("POST /images", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).post("/images").set("Content-Type", "image/png").send(PNG_HEADER);

			expect(response.status).toBe(401);
		});

		it("should use default tenant and org IDs when tenant context is not available (single-tenant mode)", async () => {
			// No tenant context wrapper - uses "0" as default tenant ID and "0" as org ID
			const response = await request(app)
				.post("/images")
				.set("Cookie", `authToken=${authToken}`)
				.set("Content-Type", "image/png")
				.send(PNG_HEADER);

			expect(response.status).toBe(201);
			// Verify it used the default tenant/org IDs ("0"/"0" in single-tenant mode)
			expect(mockImageStorageService.uploadImage).toHaveBeenCalledWith(
				"0",
				"0",
				expect.any(Buffer),
				"image/png",
				"png",
				undefined,
				undefined,
			);
		});

		it("should return 400 when no body provided", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.post("/images")
					.set("Cookie", `authToken=${authToken}`)
					.set("Content-Type", "image/png")
					.send(Buffer.alloc(0));
			});

			expect(response?.status).toBe(400);
			expect(response?.body.error).toContain("No image data");
		});

		it("should return 400 when Content-Type is not an image type", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				// Send with text/plain content type - express.raw won't parse it
				response = await request(app)
					.post("/images")
					.set("Cookie", `authToken=${authToken}`)
					.set("Content-Type", "text/plain")
					.send("not an image");
			});

			// Body won't be parsed, so it will be empty
			expect(response?.status).toBe(400);
			expect(response?.body.error).toContain("No image data");
		});

		it("should return 400 for disallowed MIME type", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.post("/images")
					.set("Cookie", `authToken=${authToken}`)
					.set("Content-Type", "image/svg+xml")
					.send(Buffer.from("<svg></svg>"));
			});

			expect(response?.status).toBe(400);
			expect(response?.body.error).toContain("not allowed");
		});

		it("should return 400 when magic bytes don't match claimed type", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				// Claim JPEG but send PNG data
				response = await request(app)
					.post("/images")
					.set("Cookie", `authToken=${authToken}`)
					.set("Content-Type", "image/jpeg")
					.send(PNG_HEADER);
			});

			expect(response?.status).toBe(400);
			expect(response?.body.error).toContain("does not match");
		});

		it("should return 400 when file size exceeds limit", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			// Create a buffer larger than the configured limit (10MB + buffer)
			const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
			// Add PNG magic bytes at the start so it looks like a valid PNG
			PNG_HEADER.copy(oversizedBuffer, 0);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.post("/images")
					.set("Cookie", `authToken=${authToken}`)
					.set("Content-Type", "image/png")
					.send(oversizedBuffer);
			});

			expect(response?.status).toBe(400);
			expect(response?.body.error).toContain("exceeds maximum allowed size");
		});

		it("should handle LIMIT_FILE_SIZE error code (alternate error format)", async () => {
			// Test the LIMIT_FILE_SIZE branch of handlePayloadTooLarge
			// This error code is used by some Node/Express versions instead of PayloadTooLargeError
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			// Create an app that uses the exported handler directly
			const testApp = express();
			testApp.use(cookieParser());

			const handler = createPayloadTooLargeHandler(10 * 1024 * 1024);

			// Mount middleware that triggers error, then the error handler
			testApp.post(
				"/images",
				(_req: express.Request, _res: express.Response, next: express.NextFunction) => {
					const err = new Error("File too large") as NodeJS.ErrnoException;
					err.code = "LIMIT_FILE_SIZE";
					next(err);
				},
				handler,
			);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(testApp)
					.post("/images")
					.set("Cookie", `authToken=${authToken}`)
					.set("Content-Type", "image/png")
					.send(PNG_HEADER);
			});

			expect(response?.status).toBe(400);
			expect(response?.body.error).toContain("exceeds maximum allowed size");
		});

		it("should pass non-payload errors to next error handler", async () => {
			// Test the next(err) branch of handlePayloadTooLarge for non-payload errors
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			// Create an app that uses the exported handler directly
			const testApp = express();
			testApp.use(cookieParser());

			const handler = createPayloadTooLargeHandler(10 * 1024 * 1024);

			// Mount middleware that triggers a non-payload error, then the error handler
			testApp.post(
				"/images",
				(_req: express.Request, _res: express.Response, next: express.NextFunction) => {
					const err = new Error("Some database error");
					next(err);
				},
				handler,
			);

			// Add final error handler to catch errors passed through
			testApp.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
				res.status(500).json({ error: err.message, handledByFinalHandler: true });
			});

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(testApp)
					.post("/images")
					.set("Cookie", `authToken=${authToken}`)
					.set("Content-Type", "image/png")
					.send(PNG_HEADER);
			});

			expect(response?.status).toBe(500);
			expect(response?.body.error).toBe("Some database error");
			expect(response?.body.handledByFinalHandler).toBe(true);
		});

		it("should upload valid PNG image", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.post("/images")
					.set("Cookie", `authToken=${authToken}`)
					.set("Content-Type", "image/png")
					.send(PNG_HEADER);
			});

			expect(response?.status).toBe(201);
			expect(response?.body.imageId).toBe("123/456/_default/test-uuid-1234.png");
			expect(response?.body.url).toBe("/api/images/123/456/_default/test-uuid-1234.png");
			// Verify asset metadata was saved to database (org isolation handled by schema-scoped DAO)
			expect(mockAssetDao.createAsset).toHaveBeenCalledWith({
				s3Key: "123/456/_default/test-uuid-1234.png",
				assetType: "image",
				mimeType: "image/png",
				size: 1234,
				originalFilename: null,
				uploadedBy: 1,
				spaceId: null,
			});
		});

		it("should pass original filename to storage service and database", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			await runWithTenantContext(context, async () => {
				await request(app)
					.post("/images")
					.set("Cookie", `authToken=${authToken}`)
					.set("Content-Type", "image/png")
					.set("X-Original-Filename", "my-screenshot.png")
					.send(PNG_HEADER);
			});

			expect(mockImageStorageService.uploadImage).toHaveBeenCalledWith(
				"123",
				"456",
				expect.any(Buffer),
				"image/png",
				"png",
				"my-screenshot.png",
				undefined,
			);
			// Verify original filename was saved to database
			expect(mockAssetDao.createAsset).toHaveBeenCalledWith({
				s3Key: "123/456/_default/test-uuid-1234.png",
				assetType: "image",
				mimeType: "image/png",
				size: 1234,
				originalFilename: "my-screenshot.png",
				uploadedBy: 1,
				spaceId: null,
			});
		});

		it("should truncate very long filenames to 255 characters", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			// Create a filename longer than 255 characters
			const longFilename = `${"a".repeat(500)}.png`;

			await runWithTenantContext(context, async () => {
				await request(app)
					.post("/images")
					.set("Cookie", `authToken=${authToken}`)
					.set("Content-Type", "image/png")
					.set("X-Original-Filename", longFilename)
					.send(PNG_HEADER);
			});

			// Verify the filename was truncated to 255 chars
			expect(mockAssetDao.createAsset).toHaveBeenCalledWith(
				expect.objectContaining({
					originalFilename: "a".repeat(255),
				}),
			);
		});

		it("should handle storage service errors", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			(mockImageStorageService.uploadImage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error("S3 error"),
			);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.post("/images")
					.set("Cookie", `authToken=${authToken}`)
					.set("Content-Type", "image/png")
					.send(PNG_HEADER);
			});

			expect(response?.status).toBe(500);
			expect(response?.body.error).toContain("Failed to upload");
		});

		it("should upload image with space scoping when X-Space-Id header is provided", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			const space = mockSpace({ id: 42, slug: "my-space" });
			(mockSpaceDao.getSpace as ReturnType<typeof vi.fn>).mockResolvedValueOnce(space);
			(mockImageStorageService.uploadImage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				imageId: "123/456/my-space/test-uuid-1234.png",
				bucket: "jolli-images-test",
				key: "123/456/my-space/test-uuid-1234.png",
				mimeType: "image/png",
				size: 1234,
			});

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.post("/images")
					.set("Cookie", `authToken=${authToken}`)
					.set("Content-Type", "image/png")
					.set("X-Space-Id", "42")
					.send(PNG_HEADER);
			});

			expect(response?.status).toBe(201);
			expect(response?.body.imageId).toBe("123/456/my-space/test-uuid-1234.png");
			// Verify space was looked up
			expect(mockSpaceDao.getSpace).toHaveBeenCalledWith(42, 1);
			// Verify upload was called with space slug
			expect(mockImageStorageService.uploadImage).toHaveBeenCalledWith(
				"123",
				"456",
				expect.any(Buffer),
				"image/png",
				"png",
				undefined,
				"my-space",
			);
			// Verify asset was saved with spaceId
			expect(mockAssetDao.createAsset).toHaveBeenCalledWith(
				expect.objectContaining({
					spaceId: 42,
				}),
			);
		});

		it("should upload as org-wide when X-Space-Id header references non-existent space", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			// Space not found
			(mockSpaceDao.getSpace as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.post("/images")
					.set("Cookie", `authToken=${authToken}`)
					.set("Content-Type", "image/png")
					.set("X-Space-Id", "999")
					.send(PNG_HEADER);
			});

			expect(response?.status).toBe(201);
			// Verify upload was called without space slug (org-wide)
			expect(mockImageStorageService.uploadImage).toHaveBeenCalledWith(
				"123",
				"456",
				expect.any(Buffer),
				"image/png",
				"png",
				undefined,
				undefined,
			);
			// Verify asset was saved without spaceId
			expect(mockAssetDao.createAsset).toHaveBeenCalledWith(
				expect.objectContaining({
					spaceId: null,
				}),
			);
		});

		it("should ignore invalid X-Space-Id header format", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.post("/images")
					.set("Cookie", `authToken=${authToken}`)
					.set("Content-Type", "image/png")
					.set("X-Space-Id", "not-a-number")
					.send(PNG_HEADER);
			});

			expect(response?.status).toBe(201);
			// Space lookup should not be called for invalid format
			expect(mockSpaceDao.getSpace).not.toHaveBeenCalled();
			// Verify upload was called without space slug (org-wide)
			expect(mockImageStorageService.uploadImage).toHaveBeenCalledWith(
				"123",
				"456",
				expect.any(Buffer),
				"image/png",
				"png",
				undefined,
				undefined,
			);
		});
	});

	describe("GET /images/:imageId", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).get("/images/test-uuid.png");

			expect(response.status).toBe(401);
		});

		it("should work when tenant context is not available (single-tenant mode)", async () => {
			// No tenant context wrapper - imageId is the full S3 key path
			const imageId = "0/0/_default/test-uuid.png";
			(mockAssetDao.findByS3KeyWithSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockAsset({ s3Key: imageId }),
			);

			const response = await request(app).get(`/images/${imageId}`).set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(302);
			// Verify it used empty set (deny space-scoped, allow org-wide) since no X-Space-Id header
			expect(mockAssetDao.findByS3KeyWithSpaceAccess).toHaveBeenCalledWith(imageId, new Set());
			// Verify it used the imageId directly (no tenantId param)
			expect(mockImageStorageService.getSignedUrl).toHaveBeenCalledWith(imageId, {
				contentDisposition: "inline",
			});
		});

		it("should return 404 when image does not exist", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			(mockAssetDao.findByS3KeyWithSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.get("/images/123/456/_default/nonexistent.png")
					.set("Cookie", `authToken=${authToken}`);
			});

			expect(response?.status).toBe(404);
			expect(response?.body.error).toContain("not found");
		});

		it("should redirect to signed URL", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			const imageId = "123/456/_default/test-uuid.png";
			(mockAssetDao.findByS3KeyWithSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockAsset({ s3Key: imageId }),
			);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app).get(`/images/${imageId}`).set("Cookie", `authToken=${authToken}`);
			});

			expect(response?.status).toBe(302);
			expect(response?.headers.location).toBe("https://s3.example.com/signed-url");
			// Verify the DAO was called with correct key (full path) and empty set (deny space-scoped)
			expect(mockAssetDao.findByS3KeyWithSpaceAccess).toHaveBeenCalledWith(imageId, new Set());
			// Service call uses imageId directly (no tenantId param)
			expect(mockImageStorageService.getSignedUrl).toHaveBeenCalledWith(imageId, {
				contentDisposition: "inline",
			});
		});

		it("should use space access validation when X-Space-Id header is provided", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			const imageId = "123/456/my-space/test-uuid.png";
			(mockAssetDao.findByS3KeyWithSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockAsset({ s3Key: imageId, spaceId: 42 }),
			);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.get(`/images/${imageId}`)
					.set("Cookie", `authToken=${authToken}`)
					.set("X-Space-Id", "42");
			});

			expect(response?.status).toBe(302);
			// Verify the DAO was called with space access set containing the space ID
			expect(mockAssetDao.findByS3KeyWithSpaceAccess).toHaveBeenCalledWith(imageId, new Set([42]));
		});

		it("should return 404 when image is not accessible from the requested space", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			const imageId = "123/456/other-space/test-uuid.png";
			// findByS3KeyWithSpaceAccess returns undefined when not accessible
			(mockAssetDao.findByS3KeyWithSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.get(`/images/${imageId}`)
					.set("Cookie", `authToken=${authToken}`)
					.set("X-Space-Id", "42");
			});

			expect(response?.status).toBe(404);
			expect(response?.body.error).toContain("not found");
		});

		it("should use spaceId query param for space access validation (for img tags)", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			const imageId = "123/456/my-space/test-uuid.png";
			(mockAssetDao.findByS3KeyWithSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockAsset({ s3Key: imageId, spaceId: 42 }),
			);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.get(`/images/${imageId}?spaceId=42`)
					.set("Cookie", `authToken=${authToken}`);
			});

			expect(response?.status).toBe(302);
			// Verify the DAO was called with space access set from query param
			expect(mockAssetDao.findByS3KeyWithSpaceAccess).toHaveBeenCalledWith(imageId, new Set([42]));
		});

		it("should prefer spaceId query param over X-Space-Id header", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			const imageId = "123/456/my-space/test-uuid.png";
			(mockAssetDao.findByS3KeyWithSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockAsset({ s3Key: imageId, spaceId: 99 }),
			);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.get(`/images/${imageId}?spaceId=99`)
					.set("Cookie", `authToken=${authToken}`)
					.set("X-Space-Id", "42"); // Header should be ignored
			});

			expect(response?.status).toBe(302);
			// Verify the DAO was called with query param value (99), not header value (42)
			expect(mockAssetDao.findByS3KeyWithSpaceAccess).toHaveBeenCalledWith(imageId, new Set([99]));
		});

		it("should return 404 when image is not accessible via spaceId query param", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			const imageId = "123/456/other-space/test-uuid.png";
			// findByS3KeyWithSpaceAccess returns undefined when not accessible
			(mockAssetDao.findByS3KeyWithSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.get(`/images/${imageId}?spaceId=42`)
					.set("Cookie", `authToken=${authToken}`);
			});

			expect(response?.status).toBe(404);
			expect(response?.body.error).toContain("not found");
		});

		it("should return 404 for space-scoped image when no spaceId context is provided (security)", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			const imageId = "123/456/some-space/test-uuid.png";
			// findByS3KeyWithSpaceAccess returns undefined because empty set doesn't match any spaceId
			(mockAssetDao.findByS3KeyWithSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				// No spaceId query param or header - should block space-scoped images
				response = await request(app).get(`/images/${imageId}`).set("Cookie", `authToken=${authToken}`);
			});

			expect(response?.status).toBe(404);
			expect(response?.body.error).toContain("not found");
			// Verify the DAO was called with empty set (blocks space-scoped assets)
			expect(mockAssetDao.findByS3KeyWithSpaceAccess).toHaveBeenCalledWith(imageId, new Set());
		});

		it("should handle storage service errors", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			(mockAssetDao.findByS3KeyWithSpaceAccess as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error("DB error"),
			);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.get("/images/123/456/_default/test.png")
					.set("Cookie", `authToken=${authToken}`);
			});

			expect(response?.status).toBe(500);
		});

		// Note: Cross-org isolation is handled by schema-scoped DAO (each org has its own DB schema),
		// so there's no explicit orgId check needed in the router anymore.
	});

	describe("DELETE /images/:imageId", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).delete("/images/123/456/_default/test-uuid.png");

			expect(response.status).toBe(401);
		});

		it("should work when tenant context is not available (single-tenant mode)", async () => {
			// No tenant context wrapper - imageId is the full S3 key path
			const imageId = "0/0/_default/test-uuid.png";
			(mockAssetDao.findByS3Key as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockAsset({ s3Key: imageId }));

			const response = await request(app).delete(`/images/${imageId}`).set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(204);
			// Verify it used the imageId directly (no tenantId param)
			expect(mockImageStorageService.deleteImage).toHaveBeenCalledWith(imageId);
		});

		it("should return 404 when image does not exist", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			(mockAssetDao.findByS3Key as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.delete("/images/123/456/_default/nonexistent.png")
					.set("Cookie", `authToken=${authToken}`);
			});

			expect(response?.status).toBe(404);
		});

		it("should delete image and return 204", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			const imageId = "123/456/_default/test-uuid.png";
			(mockAssetDao.findByS3Key as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockAsset({ s3Key: imageId, uploadedBy: 1 }),
			);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app).delete(`/images/${imageId}`).set("Cookie", `authToken=${authToken}`);
			});

			expect(response?.status).toBe(204);
			// Verify soft delete in DB and hard delete from S3 (imageId is the full path)
			expect(mockAssetDao.softDelete).toHaveBeenCalledWith(imageId);
			expect(mockImageStorageService.deleteImage).toHaveBeenCalledWith(imageId);
		});

		it("should return 403 when trying to delete another user's image", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			const imageId = "123/456/_default/test-uuid.png";
			// Image was uploaded by user 999, but current user is 1
			(mockAssetDao.findByS3Key as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockAsset({ s3Key: imageId, uploadedBy: 999 }),
			);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app).delete(`/images/${imageId}`).set("Cookie", `authToken=${authToken}`);
			});

			expect(response?.status).toBe(403);
			expect(response?.body.error).toContain("only delete images you uploaded");
			// Verify nothing was deleted
			expect(mockAssetDao.softDelete).not.toHaveBeenCalled();
			expect(mockImageStorageService.deleteImage).not.toHaveBeenCalled();
		});

		it("should handle storage service errors", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			(mockImageStorageService.deleteImage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error("S3 error"),
			);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(app)
					.delete("/images/123/456/_default/test.png")
					.set("Cookie", `authToken=${authToken}`);
			});

			expect(response?.status).toBe(500);
		});

		// Note: Cross-org isolation is handled by schema-scoped DAO (each org has its own DB schema),
		// so there's no explicit orgId check needed in the router anymore.
	});

	describe("router without authHandler (direct 401 tests)", () => {
		let appNoAuth: Express;

		beforeEach(() => {
			// Create app WITHOUT authHandler to test the router's own auth checks
			appNoAuth = express();
			appNoAuth.use(cookieParser());
			appNoAuth.use(
				"/images",
				createImageRouter(mockImageStorageService, mockAssetDaoProvider, mockSpaceDaoProvider, tokenUtil),
			);

			// Add error handler
			appNoAuth.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
				res.status(500).json({ error: err.message });
			});
		});

		it("POST should return 401 when token is invalid", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(appNoAuth)
					.post("/images")
					.set("Cookie", "authToken=invalid-token")
					.set("Content-Type", "image/png")
					.send(PNG_HEADER);
			});

			expect(response?.status).toBe(401);
		});

		it("GET should return 401 when token is invalid", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(appNoAuth)
					.get("/images/123/456/_default/test.png")
					.set("Cookie", "authToken=invalid-token");
			});

			expect(response?.status).toBe(401);
		});

		it("DELETE should return 401 when token is invalid", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(appNoAuth)
					.delete("/images/123/456/_default/test.png")
					.set("Cookie", "authToken=invalid-token");
			});

			expect(response?.status).toBe(401);
		});
	});
});
