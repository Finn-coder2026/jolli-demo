import { clearPiiRegistry, getRegisteredPiiFields } from "../audit/PiiDecorators";
import { defineUserInvitations, postSyncUserInvitations } from "./UserInvitation";
import { DataTypes, type Sequelize } from "sequelize";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("UserInvitation", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({}),
			models: {},
			query: vi.fn(),
		} as unknown as Sequelize;
	});

	it("should define user_invitation model with correct schema", () => {
		defineUserInvitations(mockSequelize);

		expect(mockSequelize.define).toHaveBeenCalledWith("user_invitation", expect.any(Object), {
			timestamps: true,
			updatedAt: false,
			underscored: true,
			tableName: "user_invitations",
		});

		const schema = vi.mocked(mockSequelize.define).mock.calls[0][1] as Record<string, unknown>;

		// Validate id field
		expect(schema.id).toEqual({
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		});

		// Validate email field
		expect(schema.email).toEqual({
			type: DataTypes.STRING(255),
			allowNull: false,
		});

		// Validate invitedBy field (no FK constraint - inviter may not exist in active_users)
		expect(schema.invitedBy).toEqual({
			type: DataTypes.BIGINT,
			allowNull: false,
		});

		// Validate role field
		expect(schema.role).toEqual({
			type: DataTypes.STRING(50),
			allowNull: false,
		});

		// Validate name field
		expect(schema.name).toEqual({
			type: DataTypes.STRING(255),
			allowNull: true,
		});

		// Validate verificationId field (no comment to avoid Sequelize describeTable bug in multi-schema)
		expect(schema.verificationId).toEqual({
			type: DataTypes.INTEGER,
			allowNull: true,
		});

		// Validate expiresAt field
		expect(schema.expiresAt).toEqual({
			type: DataTypes.DATE,
			allowNull: false,
		});

		// Validate status field
		expect(schema.status).toEqual({
			type: DataTypes.STRING(50),
			allowNull: false,
			defaultValue: "pending",
		});
	});

	it("should return existing model if already defined", () => {
		const existingModel = { name: "ExistingUserInvitation" };
		mockSequelize = {
			define: vi.fn(),
			models: {
				user_invitation: existingModel,
			},
		} as unknown as Sequelize;

		const model = defineUserInvitations(mockSequelize);

		expect(model).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});

	describe("postSyncUserInvitations", () => {
		it("should drop legacy FK constraints, create indexes, and add verification_id column", async () => {
			// Mock the column check to return empty (column doesn't exist)
			vi.mocked(mockSequelize.query).mockResolvedValue([[], undefined] as never);

			await postSyncUserInvitations(mockSequelize);

			// Should remove column comments first (fixes Sequelize describeTable bug in multi-schema)
			expect(mockSequelize.query).toHaveBeenCalledWith(
				"COMMENT ON COLUMN user_invitations.verification_id IS NULL",
			);
			// Should drop legacy FK constraints (2 queries)
			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining("DROP CONSTRAINT IF EXISTS user_invitations_invited_by_fkey;"),
			);
			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining("DROP CONSTRAINT IF EXISTS user_invitations_invited_by_fkey1;"),
			);
			// Create indexes (3 queries)
			expect(mockSequelize.query).toHaveBeenCalledWith(expect.stringContaining("idx_user_invitations_email"));
			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining("idx_user_invitations_status_expires"),
			);
			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining("user_invitations_email_pending_unique"),
			);
			// Migration: check for verification_id column and add if missing (1-2 queries)
			expect(mockSequelize.query).toHaveBeenCalledWith(expect.stringContaining("verification_id"));
			// Index on verification_id (1 query)
			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining("idx_user_invitations_verification_id"),
			);
		});

		it("should not add verification_id column if it already exists", async () => {
			// Mock the column check to return that column exists
			vi.mocked(mockSequelize.query).mockImplementation((query: unknown) => {
				if (typeof query === "string" && query.includes("information_schema.columns")) {
					return Promise.resolve([[{ column_name: "verification_id" }], undefined] as never);
				}
				return Promise.resolve([[], undefined] as never);
			});

			await postSyncUserInvitations(mockSequelize);

			// Should not call ADD COLUMN
			expect(mockSequelize.query).not.toHaveBeenCalledWith(
				expect.stringContaining("ADD COLUMN verification_id INTEGER"),
			);
		});

		it("should handle error when checking/adding verification_id column gracefully", async () => {
			// Mock: verification_id column check throws error
			let verificationCheckDone = false;
			vi.mocked(mockSequelize.query).mockImplementation((query: unknown) => {
				if (
					typeof query === "string" &&
					query.includes("information_schema.columns") &&
					query.includes("verification_id") &&
					!verificationCheckDone
				) {
					verificationCheckDone = true;
					return Promise.reject(new Error("Column check failed"));
				}
				return Promise.resolve([[], undefined] as never);
			});

			// Should not throw - error is caught internally
			await expect(postSyncUserInvitations(mockSequelize)).resolves.not.toThrow();
		});

		it("should drop token_hash column if it exists", async () => {
			// Mock: token_hash column exists
			vi.mocked(mockSequelize.query).mockImplementation((query: unknown) => {
				if (
					typeof query === "string" &&
					query.includes("information_schema.columns") &&
					query.includes("token_hash")
				) {
					return Promise.resolve([[{ column_name: "token_hash" }], undefined] as never);
				}
				return Promise.resolve([[], undefined] as never);
			});

			await postSyncUserInvitations(mockSequelize);

			// Should call DROP COLUMN for token_hash
			expect(mockSequelize.query).toHaveBeenCalledWith(expect.stringContaining("DROP COLUMN token_hash"));
		});

		it("should handle error when dropping token_hash column gracefully", async () => {
			// Mock: token_hash column check returns column, but drop fails
			let tokenHashCheckDone = false;
			vi.mocked(mockSequelize.query).mockImplementation((query: unknown) => {
				if (
					typeof query === "string" &&
					query.includes("information_schema.columns") &&
					query.includes("token_hash") &&
					!tokenHashCheckDone
				) {
					tokenHashCheckDone = true;
					return Promise.resolve([[{ column_name: "token_hash" }], undefined] as never);
				}
				if (typeof query === "string" && query.includes("DROP COLUMN token_hash")) {
					return Promise.reject(new Error("Drop column failed"));
				}
				return Promise.resolve([[], undefined] as never);
			});

			// Should not throw - error is caught internally
			await expect(postSyncUserInvitations(mockSequelize)).resolves.not.toThrow();
		});
	});

	describe("UserInvitationPII schema", () => {
		afterEach(() => {
			clearPiiRegistry();
		});

		it("should register PII fields for user_invitation resource type", () => {
			const piiFields = getRegisteredPiiFields("user_invitation");

			expect(piiFields.size).toBe(2);
			expect(piiFields.has("email")).toBe(true);
			expect(piiFields.has("name")).toBe(true);

			// Verify field descriptions
			expect(piiFields.get("email")?.description).toBe("Invitee email address");
			expect(piiFields.get("name")?.description).toBe("Invitee name");
		});
	});
});
