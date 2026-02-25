import type { ModelDef } from "../util/ModelDef";
import { PERMISSION_CATEGORIES, type PermissionCategory } from "jolli-common";
import { DataTypes, type Sequelize } from "sequelize";

// Re-export so existing backend imports continue to work
export { PERMISSION_CATEGORIES, type PermissionCategory };

/**
 * Permission definition.
 * Permissions are system-defined and cannot be created/deleted by users.
 */
export interface Permission {
	readonly id: number;
	readonly name: string;
	readonly slug: string;
	readonly description: string | null;
	readonly category: string;
	readonly createdAt: Date;
}

/**
 * Type for creating a new permission (used for seeding).
 */
export type NewPermission = Omit<Permission, "id" | "createdAt">;

/**
 * Built-in permissions for seeding.
 * Format: category.action
 */
export const BUILT_IN_PERMISSIONS: ReadonlyArray<NewPermission> = [
	// Users
	{ slug: "users.view", name: "View Users", description: "View user list and profiles", category: "users" },
	{
		slug: "users.edit",
		name: "Edit Users",
		description: "Invite, edit, deactivate, and remove users",
		category: "users",
	},

	// Spaces
	{ slug: "spaces.view", name: "View Spaces", description: "View spaces and their content", category: "spaces" },
	{
		slug: "spaces.edit",
		name: "Edit Spaces",
		description: "Create, edit, and delete spaces",
		category: "spaces",
	},

	// Integrations
	{
		slug: "integrations.view",
		name: "View Integrations",
		description: "View integrations",
		category: "integrations",
	},
	{
		slug: "integrations.edit",
		name: "Edit Integrations",
		description: "Add, edit, and delete integrations",
		category: "integrations",
	},

	// Sites
	{ slug: "sites.view", name: "View Sites", description: "View doc sites", category: "sites" },
	{
		slug: "sites.edit",
		name: "Edit Sites",
		description: "Create, edit, delete, and rebuild doc sites",
		category: "sites",
	},

	// Roles
	{ slug: "roles.view", name: "View Roles", description: "View roles and permissions", category: "roles" },
	{
		slug: "roles.edit",
		name: "Edit Roles",
		description: "Create, edit, and delete custom roles",
		category: "roles",
	},

	// Dashboard
	{
		slug: "dashboard.view",
		name: "View Dashboard",
		description: "Access dashboard and job monitoring",
		category: "dashboard",
	},

	// Folders / Articles
	{
		slug: "articles.view",
		name: "View Articles",
		description: "View and browse articles and folders",
		category: "articles",
	},
	{
		slug: "articles.edit",
		name: "Edit Articles",
		description: "Create, edit, and delete articles and folders",
		category: "articles",
	},
];

/**
 * Default permissions for each built-in role.
 * Maps role slug to array of permission slugs.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, ReadonlyArray<string>> = {
	owner: [
		// Owner has all permissions
		"users.view",
		"users.edit",
		"spaces.view",
		"spaces.edit",
		"integrations.view",
		"integrations.edit",
		"sites.view",
		"sites.edit",
		"roles.view",
		"roles.edit",
		"dashboard.view",
		"articles.view",
		"articles.edit",
	],
	admin: [
		// Admin has all permissions except roles
		"users.view",
		"users.edit",
		"spaces.view",
		"spaces.edit",
		"integrations.view",
		"integrations.edit",
		"sites.view",
		"sites.edit",
		"dashboard.view",
		"articles.view",
		"articles.edit",
	],
	member: [
		// Member has dashboard, spaces, and articles
		"dashboard.view",
		"spaces.view",
		"spaces.edit",
		"articles.view",
		"articles.edit",
	],
};

/**
 * Define the Permission model in Sequelize.
 */
export function definePermissions(sequelize: Sequelize): ModelDef<Permission> {
	const existing = sequelize.models?.permission;
	if (existing) {
		return existing as ModelDef<Permission>;
	}
	return sequelize.define("permission", schema, {
		timestamps: true,
		updatedAt: false, // Permissions are immutable after creation
		underscored: true,
		tableName: "permissions",
	});
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	name: {
		type: DataTypes.STRING(100),
		allowNull: false,
	},
	slug: {
		type: DataTypes.STRING(50),
		allowNull: false,
		unique: "permissions_slug_key",
	},
	description: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	category: {
		type: DataTypes.STRING(50),
		allowNull: false,
	},
};
