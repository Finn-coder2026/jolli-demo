import { PIIField, PIISchema } from "../audit/PiiDecorators";
import type { ModelDef } from "../util/ModelDef";
import type {
	GithubRepoIntegrationMetadata,
	IntegrationMetadata,
	IntegrationStatus,
	IntegrationType,
	StaticFileIntegrationMetadata,
} from "jolli-common";
import { DataTypes, type Sequelize } from "sequelize";
import { z } from "zod";

export interface Integration {
	readonly id: number;
	readonly type: IntegrationType;
	readonly name: string;
	readonly status: IntegrationStatus;
	readonly metadata?: IntegrationMetadata | undefined;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export const IntegrationTypeSchema = z.enum(["github", "static_file", "unknown"]);

export const IntegrationStatusSchema = z.enum(["active", "needs_repo_access", "error", "pending_installation"]);

export const GithubRepoIntegrationMetadataSchema = z.object({
	repo: z.string(),
	branch: z.string(),
	features: z.array(z.string()),
	githubAppId: z.number().optional(),
	installationId: z.number().optional(),
	lastAccessCheck: z.string().optional(),
	accessError: z.string().optional(),
});

export const StaticFileIntegrationMetadataSchema = z.object({
	fileCount: z.number(),
	lastUpload: z.string().optional(),
});

export const IntegrationSchema = z.object({
	id: z.number(),
	type: IntegrationTypeSchema,
	name: z.string(),
	status: IntegrationStatusSchema,
	metadata: z.unknown().optional(),
	createdAt: z.date().optional(),
	updatedAt: z.date().optional(),
});

export interface GithubRepoIntegration extends Integration {
	readonly type: "github";
	readonly metadata: GithubRepoIntegrationMetadata;
}

export interface StaticFileIntegration extends Integration {
	readonly type: "static_file";
	readonly metadata: StaticFileIntegrationMetadata;
}

export type NewIntegration = Omit<Integration, "id" | "createdAt" | "updatedAt">;

export function defineIntegrations(sequelize: Sequelize): ModelDef<Integration> {
	return sequelize.define("integrations", schema, { timestamps: true, indexes });
}

const indexes = [
	{
		unique: true,
		fields: ["type", "name"],
	},
];

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	type: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	name: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	status: {
		type: DataTypes.STRING,
		allowNull: false,
		defaultValue: "active",
	},
	metadata: {
		type: DataTypes.JSONB,
		allowNull: true,
	},
};

/**
 * PII schema for integration resource type.
 * Registers which fields contain PII and should be encrypted in audit logs.
 */
@PIISchema("integration")
class IntegrationPII {
	@PIIField({ description: "Integration account email (from metadata)" })
	accountEmail!: string;

	@PIIField({ description: "Integration account name (from metadata)" })
	accountName!: string;
}

// Reference the class to ensure decorators are executed
void IntegrationPII;
