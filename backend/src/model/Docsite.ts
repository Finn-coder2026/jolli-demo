import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Status enum - lifecycle of a docsite
 */
export type DocsiteStatus = "pending" | "building" | "active" | "error" | "archived";

/**
 * Visibility enum - access control marker
 */
export type DocsiteVisibility = "internal" | "external";

/**
 * Deployment environment
 */
export type DocsiteEnvironment = "production" | "preview";

/**
 * Single deployment record
 */
export interface DocsiteDeployment {
	environment: DocsiteEnvironment;
	url: string;
	deploymentId?: string;
	deployedAt: string;
	status: "ready" | "building" | "error";
	error?: string;
}

/**
 * Repository source configuration
 */
export interface DocsiteRepoSource {
	repo: string;
	branch: string;
	paths?: Array<string>;
	integrationId?: number;
}

/**
 * Metadata - stored in JSONB field
 */
export interface DocsiteMetadata {
	repos: Array<DocsiteRepoSource>;
	deployments: Array<DocsiteDeployment>;
	framework?: string;
	buildCommand?: string;
	outputDirectory?: string;
	access?: {
		requiresAuth?: boolean;
		allowedDomains?: Array<string>;
		allowedEmails?: Array<string>;
		customAuthUrl?: string;
	};
	lastBuildAt?: string;
	lastDeployedAt?: string;
	lastHealthCheck?: string;
	lastBuildError?: string;
}

/**
 * Main docsite interface
 */
export interface Docsite {
	readonly id: number;
	readonly name: string;
	readonly displayName: string;
	readonly userId: number | undefined;
	readonly visibility: DocsiteVisibility;
	readonly status: DocsiteStatus;
	readonly metadata: DocsiteMetadata | undefined;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/**
 * Type for creating sites
 */
export type Site = Omit<Docsite, "id" | "createdAt" | "updatedAt">;

export const TABLE_NAME_DOCSITES = "docsites";

export function defineDocsites(sequelize: Sequelize): ModelDef<Docsite> {
	return sequelize.define(TABLE_NAME_DOCSITES, schema, { timestamps: true, indexes });
}

const indexes = [
	{
		unique: true,
		fields: ["name"],
	},
	{
		fields: ["user_id"],
	},
	{
		fields: ["visibility"],
	},
	{
		fields: ["status"],
	},
	{
		fields: ["visibility", "status"],
	},
];

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	name: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	displayName: {
		type: DataTypes.STRING,
		field: "display_name",
		allowNull: false,
	},
	userId: {
		type: DataTypes.INTEGER,
		field: "user_id",
		allowNull: true,
		references: {
			model: "users",
			key: "id",
		},
		onDelete: "SET NULL",
	},
	visibility: {
		type: DataTypes.STRING,
		allowNull: false,
		defaultValue: "internal",
		validate: {
			isIn: [["internal", "external"]],
		},
	},
	status: {
		type: DataTypes.STRING,
		allowNull: false,
		defaultValue: "pending",
		validate: {
			isIn: [["pending", "building", "active", "error", "archived"]],
		},
	},
	metadata: {
		type: DataTypes.JSONB,
		allowNull: true,
	},
};
