import { PIIField, PIISchema } from "../audit/PiiDecorators";
import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

export interface User {
	readonly id: number;
	readonly email: string;
	readonly name: string;
	readonly picture: string | undefined;
	/** Whether this user is a Jolli Agent system account */
	readonly isAgent: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export type NewUser = Omit<User, "id" | "createdAt" | "updatedAt" | "isAgent"> & {
	isAgent?: boolean;
};

export function defineUsers(sequelize: Sequelize): ModelDef<User> {
	// Return existing model if already defined to preserve definition order during sync
	const existing = sequelize.models?.user;
	if (existing) {
		return existing as ModelDef<User>;
	}
	return sequelize.define("user", schema, { timestamps: true });
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	email: {
		type: DataTypes.STRING,
		allowNull: false,
		unique: "users_email_key",
	},
	name: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	picture: {
		type: DataTypes.STRING,
		allowNull: true,
	},
	isAgent: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
	},
};

/**
 * PII schema for User resource type.
 * Registers which fields contain PII and should be encrypted in audit logs.
 */
@PIISchema("user")
class UserPII {
	@PIIField({ description: "User email address" })
	email!: string;

	@PIIField({ description: "User display name" })
	name!: string;

	@PIIField({ description: "User profile picture URL" })
	picture!: string;
}

// Reference the class to ensure decorators are executed
void UserPII;
