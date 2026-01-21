import { PIIField, PIISchema } from "../audit/PiiDecorators";
import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

export interface Auth {
	readonly id: number;
	readonly email: string;
	readonly name: string;
	readonly picture: string | undefined;
	readonly provider: string;
	readonly subject: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export type NewAuth = Omit<Auth, "id" | "createdAt" | "updatedAt">;

export function defineAuths(sequelize: Sequelize): ModelDef<Auth> {
	return sequelize.define("auth", schema, {
		timestamps: true,
		indexes: [
			{
				fields: ["provider", "subject"],
				name: "auths_provider_subject_key",
				unique: true,
			},
		],
	});
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
	},
	name: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	picture: {
		type: DataTypes.STRING,
		allowNull: true,
	},
	provider: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	subject: {
		type: DataTypes.STRING,
		allowNull: false,
	},
};

/**
 * PII schema for session/auth resource type.
 * Registers which fields contain PII and should be encrypted in audit logs.
 */
@PIISchema("session")
class AuthPII {
	@PIIField({ description: "User email from OAuth provider" })
	email!: string;

	@PIIField({ description: "IP address from session" })
	ip!: string;

	@PIIField({ description: "Device information from session" })
	device!: string;
}

// Reference the class to ensure decorators are executed
void AuthPII;
