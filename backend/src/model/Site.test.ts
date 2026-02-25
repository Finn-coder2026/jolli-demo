// Import entire module to execute PII decorators
import { getRegisteredPiiFields } from "../audit/PiiDecorators";
import type { Site, SiteMetadata } from "./Site";
import * as SiteModule from "./Site";
import { defineSites, getMetadataForUpdate, getSiteMetadata, requireSiteMetadata, TABLE_NAME_SITES } from "./Site";
import { DataTypes, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Creates a minimal Site object for testing metadata accessor functions */
function makeSite(metadata: SiteMetadata | undefined): Site {
	return {
		id: 1,
		name: "test-site",
		displayName: "Test Site",
		userId: 1,
		visibility: "internal",
		status: "active",
		metadata,
		lastGeneratedAt: undefined,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

describe("Site Model", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
		} as unknown as Sequelize;
	});

	it("should define site model with correct schema", () => {
		defineSites(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith(
			TABLE_NAME_SITES,
			expect.any(Object),
			expect.objectContaining({
				timestamps: true,
			}),
		);

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		// Validate id field
		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		// Validate name field
		expect(schema.name).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
		});

		// Validate displayName field
		expect(schema.displayName).toEqual({
			type: DataTypes.STRING,
			field: "display_name",
			allowNull: false,
		});

		// Validate userId field
		expect(schema.userId).toEqual({
			type: DataTypes.INTEGER,
			field: "user_id",
			allowNull: true,
		});

		// Validate visibility field
		expect(schema.visibility).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: "internal",
			validate: {
				isIn: [["internal", "external"]],
			},
		});

		// Validate status field
		expect(schema.status).toEqual({
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: "pending",
			validate: {
				isIn: [["pending", "building", "active", "error"]],
			},
		});

		// Validate metadata field
		expect(schema.metadata).toEqual({
			type: DataTypes.JSONB,
			allowNull: true,
		});

		// Validate lastGeneratedAt field
		expect(schema.lastGeneratedAt).toEqual({
			type: DataTypes.DATE,
			field: "last_generated_at",
			allowNull: true,
		});
	});

	it("should have correct indexes defined", () => {
		defineSites(mockSequelize);

		const options = vi.mocked(mockSequelize.define).mock.calls[0][2] as Record<string, unknown>;
		const indexes = options.indexes as Array<Record<string, unknown>>;

		expect(indexes).toHaveLength(4);

		// Check for unique name index
		expect(indexes[0]).toEqual({
			name: "sites_name_key",
			unique: true,
			fields: ["name"],
		});

		// Check for user_id index
		expect(indexes[1]).toEqual({
			fields: ["user_id"],
		});

		// Check for status index
		expect(indexes[2]).toEqual({
			fields: ["status"],
		});

		// Check for last_generated_at index
		expect(indexes[3]).toEqual({
			fields: ["last_generated_at"],
		});
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingSite" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				sites: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineSites(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});

	it("should register PII schema decorators", () => {
		// This test ensures that the PII decorators are executed
		// by importing the module (SiteModule import at top triggers decorator execution)
		expect(SiteModule).toBeDefined();
		expect(SiteModule.defineSites).toBeDefined();
	});

	it("should register all PII fields in the site resource type", () => {
		// Verify that the PII decorators registered all expected fields
		const sitePiiFields = getRegisteredPiiFields("site");

		// Check that ownerEmail and contactEmail fields are registered
		expect(sitePiiFields.has("ownerEmail")).toBe(true);
		expect(sitePiiFields.has("contactEmail")).toBe(true);

		// Verify descriptions
		expect(sitePiiFields.get("ownerEmail")?.description).toBe("Site owner email (from metadata)");
		expect(sitePiiFields.get("contactEmail")?.description).toBe("Site contact email (from metadata)");
	});
});

describe("Site metadata accessors", () => {
	const sampleMetadata: SiteMetadata = {
		githubRepo: "org/repo",
		githubUrl: "https://github.com/org/repo",
		framework: "nextra-4",
		articleCount: 5,
	};

	describe("getSiteMetadata", () => {
		it("should return metadata when present", () => {
			const site = makeSite(sampleMetadata);
			expect(getSiteMetadata(site)).toBe(sampleMetadata);
		});

		it("should return undefined when metadata is missing", () => {
			const site = makeSite(undefined);
			expect(getSiteMetadata(site)).toBeUndefined();
		});
	});

	describe("requireSiteMetadata", () => {
		it("should return metadata when present", () => {
			const site = makeSite(sampleMetadata);
			expect(requireSiteMetadata(site)).toBe(sampleMetadata);
		});

		it("should throw when metadata is missing", () => {
			const site = makeSite(undefined);
			expect(() => requireSiteMetadata(site)).toThrow("Site 1 has no metadata");
		});
	});

	describe("getMetadataForUpdate", () => {
		it("should return metadata when present", () => {
			const site = makeSite(sampleMetadata);
			expect(getMetadataForUpdate(site)).toBe(sampleMetadata);
		});

		it("should return empty object when metadata is missing", () => {
			const site = makeSite(undefined);
			const result = getMetadataForUpdate(site);
			expect(result).toEqual({});
		});
	});
});
