import type { InferAttributes, Model, ModelStatic } from "sequelize";

export type ModelDef<T> = ModelStatic<T & Model<InferAttributes<T & Model>>>;
