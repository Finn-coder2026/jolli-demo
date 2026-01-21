import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

export interface Visit {
	readonly id: number;
	readonly date: Date;
	readonly visitorId: string;
	readonly userId: number | undefined;
}

export type NewVisit = Omit<Visit, "id" | "date">;

export function defineVisits(sequelize: Sequelize): ModelDef<Visit> {
	return sequelize.define("visit", schema, { timestamps: false });
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	date: {
		type: DataTypes.DATE,
		defaultValue: DataTypes.NOW,
	},
	visitorId: {
		type: DataTypes.STRING,
	},
	userId: {
		type: DataTypes.INTEGER,
		allowNull: true,
		references: {
			model: "users",
			key: "id",
		},
	},
};
