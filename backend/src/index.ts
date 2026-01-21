export * from "./core/Database";
export * from "./util/Sequelize";

/**
 * A callback for middleware when the server is shutting down.
 */
export interface ExitHandler {
	stop(code?: number): void | Promise<void>;
}
