import type { JobLog } from "../types/JobTypes.js";
import type { ModelDef } from "../util/ModelDef.js";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Job execution record in the database
 */
export interface Job {
	/**
	 * Job execution ID (from pg-boss)
	 */
	id: string;

	/**
	 * Job name
	 */
	name: string;

	/**
	 * Optional display title
	 */
	title?: string;

	/**
	 * Source job ID that triggered this job via an event
	 */
	sourceJobId?: string;

	/**
	 * Flag indicating this job should fail immediately due to loop prevention
	 */
	loopPrevented?: boolean;

	/**
	 * Reason why the job was marked for loop prevention
	 */
	loopReason?: string;

	/**
	 * Job parameters (JSON)
	 */
	params: unknown;

	/**
	 * Execution status
	 */
	status: "queued" | "active" | "completed" | "failed" | "cancelled";

	/**
	 * Start time
	 */
	startedAt?: Date;

	/**
	 * Completion time
	 */
	completedAt?: Date;

	/**
	 * Error message (if failed)
	 */
	error?: string;

	/**
	 * Error stack trace (if failed)
	 */
	errorStack?: string;

	/**
	 * Log messages from execution
	 */
	logs: Array<JobLog>;

	/**
	 * Number of retry attempts
	 */
	retryCount: number;

	/**
	 * Job progress/stats data (JSON)
	 */
	stats?: unknown;

	/**
	 * Job completion information (JSON)
	 */
	completionInfo?: unknown;

	/**
	 * Timestamp when job was pinned (pinned jobs stay visible indefinitely)
	 */
	pinnedAt?: Date | null;

	/**
	 * Timestamp when job was dismissed (dismissed jobs are hidden from dashboard)
	 */
	dismissedAt?: Date | null;

	/**
	 * Created timestamp
	 */
	createdAt: Date;

	/**
	 * Updated timestamp
	 */
	updatedAt: Date;
}

export type NewJob = Omit<
	Job,
	"createdAt" | "updatedAt" | "startedAt" | "completedAt" | "error" | "errorStack" | "stats" | "completionInfo"
>;

const schema = {
	id: {
		type: DataTypes.STRING,
		primaryKey: true,
		allowNull: false,
	},
	name: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	title: {
		type: DataTypes.STRING,
		allowNull: true,
	},
	sourceJobId: {
		type: DataTypes.STRING,
		allowNull: true,
	},
	loopPrevented: {
		type: DataTypes.BOOLEAN,
		allowNull: true,
		defaultValue: false,
	},
	loopReason: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	params: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: {},
	},
	status: {
		type: DataTypes.ENUM("queued", "active", "completed", "failed", "cancelled"),
		allowNull: false,
		defaultValue: "queued",
	},
	startedAt: {
		type: DataTypes.DATE,
		allowNull: true,
	},
	completedAt: {
		type: DataTypes.DATE,
		allowNull: true,
	},
	error: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	errorStack: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	logs: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: [],
	},
	retryCount: {
		type: DataTypes.INTEGER,
		allowNull: false,
		defaultValue: 0,
	},
	stats: {
		type: DataTypes.JSONB,
		allowNull: true,
		defaultValue: null,
	},
	completionInfo: {
		type: DataTypes.JSONB,
		allowNull: true,
		defaultValue: null,
	},
	pinnedAt: {
		type: DataTypes.DATE,
		allowNull: true,
	},
	dismissedAt: {
		type: DataTypes.DATE,
		allowNull: true,
	},
};

const indexes = [
	{
		fields: ["name"],
	},
	{
		fields: ["status"],
	},
	{
		fields: ["created_at"],
	},
	{
		fields: ["source_job_id"],
	},
];

/**
 * Define the Job model
 */
export function defineJobs(sequelize: Sequelize): ModelDef<Job> {
	return sequelize.define("jobs", schema, {
		timestamps: true,
		indexes,
	});
}
