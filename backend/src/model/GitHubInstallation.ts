import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

export type GitHubInstallationContainerType = "org" | "user";

export interface GitHubInstallation {
	/**
	 * The unique ID of the GitHub installation record in the database.
	 */
	readonly id: number;
	/**
	 * The type of the GitHub container (organization or user).
	 */
	readonly containerType: GitHubInstallationContainerType;
	/**
	 * The name of the GitHub organization or user.
	 */
	readonly name: string;
	/**
	 * The installation ID of the GitHub App.
	 */
	readonly installationId: number;
	/**
	 * The repositories that the app has access to.
	 */
	readonly repos: Array<string>;
	/**
	 * The datetime when the installation entry was created.
	 */
	readonly createdAt: Date;
	/**
	 * The datetime when the installation entry was last updated.
	 */
	readonly updatedAt: Date;
}

export type NewGitHubInstallation = Omit<GitHubInstallation, "id" | "createdAt" | "updatedAt">;

export const TABLE_NAME_GITHUB_INSTALLATIONS = "github_installations";

export function defineGitHubInstallations(sequelize: Sequelize): ModelDef<GitHubInstallation> {
	return sequelize.define(TABLE_NAME_GITHUB_INSTALLATIONS, schema, { timestamps: true, indexes });
}

const indexes = [
	{
		unique: true,
		fields: ["name"],
	},
	{
		fields: ["installation_id"],
	},
	{
		fields: ["container_type"],
	},
];

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	containerType: {
		type: DataTypes.STRING,
		field: "container_type",
		allowNull: false,
		validate: {
			isIn: [["org", "user"]],
		},
	},
	name: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	installationId: {
		type: DataTypes.INTEGER,
		field: "installation_id",
	},
	repos: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: [],
	},
};
