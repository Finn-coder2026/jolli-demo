import type { DaoPostSyncHook, Database } from "../core/Database";
import {
	type AuditAction,
	type AuditEvent,
	type AuditResourceType,
	defineAuditEvents,
	type NewAuditEvent,
} from "../model/AuditEvent";
import type { TenantOrgContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { DaoProvider } from "./DaoProvider";
import { createHash } from "node:crypto";
import { Op, type Sequelize } from "sequelize";

const log = getLog(import.meta);

/**
 * Query options for retrieving audit events
 */
export interface AuditQueryOptions {
	/** Maximum number of records to return */
	readonly limit?: number;
	/** Number of records to skip */
	readonly offset?: number;
	/** Field to order by */
	readonly orderBy?: "timestamp" | "id";
	/** Order direction */
	readonly orderDir?: "ASC" | "DESC";
}

/**
 * Filter options for querying audit events
 */
export interface AuditFilterOptions extends AuditQueryOptions {
	/** Filter by actor ID */
	readonly actorId?: number;
	/** Filter by action type */
	readonly action?: AuditAction;
	/** Filter by resource type */
	readonly resourceType?: AuditResourceType;
	/** Filter by resource ID */
	readonly resourceId?: string;
	/** Filter events after this date */
	readonly startDate?: Date;
	/** Filter events before this date */
	readonly endDate?: Date;
}

/**
 * Data Access Object for audit events
 */
export interface AuditEventDao {
	/**
	 * Create a new audit event
	 */
	create(event: NewAuditEvent): Promise<AuditEvent>;

	/**
	 * Create multiple audit events in a batch
	 */
	createBatch(events: Array<NewAuditEvent>): Promise<void>;

	/**
	 * Get an audit event by ID
	 */
	getById(id: number): Promise<AuditEvent | undefined>;

	/**
	 * Get audit events for a specific resource
	 */
	getByResource(
		resourceType: AuditResourceType,
		resourceId: string,
		options?: AuditQueryOptions,
	): Promise<Array<AuditEvent>>;

	/**
	 * Get audit events for a specific actor
	 */
	getByActor(actorId: number, options?: AuditQueryOptions): Promise<Array<AuditEvent>>;

	/**
	 * Get audit events by action type
	 */
	getByAction(action: AuditAction, options?: AuditQueryOptions): Promise<Array<AuditEvent>>;

	/**
	 * Get audit events within a date range
	 */
	getByDateRange(startDate: Date, endDate: Date, options?: AuditQueryOptions): Promise<Array<AuditEvent>>;

	/**
	 * Query audit events with multiple filters
	 */
	query(filters: AuditFilterOptions): Promise<Array<AuditEvent>>;

	/**
	 * Count audit events matching filters
	 */
	count(filters?: Omit<AuditFilterOptions, "limit" | "offset" | "orderBy" | "orderDir">): Promise<number>;

	/**
	 * Verify the integrity of an audit event by recomputing its hash
	 */
	verifyEventIntegrity(eventId: number): Promise<boolean>;

	/**
	 * Delete audit events older than specified number of days
	 * @returns Number of deleted records
	 */
	deleteOlderThan(days: number): Promise<number>;
}

/**
 * Compute SHA-256 hash for event integrity verification
 */
function computeEventHash(event: NewAuditEvent): string {
	const payload = JSON.stringify({
		timestamp: event.timestamp.toISOString(),
		actorId: event.actorId,
		actorType: event.actorType,
		action: event.action,
		resourceType: event.resourceType,
		resourceId: event.resourceId,
		changes: event.changes,
	});
	return createHash("sha256").update(payload).digest("hex");
}

/**
 * Apply query options to Sequelize find options
 */
function applyQueryOptions(options?: AuditQueryOptions): {
	limit?: number;
	offset?: number;
	order?: Array<[string, string]>;
} {
	const result: { limit?: number; offset?: number; order?: Array<[string, string]> } = {};

	if (options?.limit !== undefined) {
		result.limit = options.limit;
	}
	if (options?.offset !== undefined) {
		result.offset = options.offset;
	}

	const orderBy = options?.orderBy ?? "timestamp";
	const orderDir = options?.orderDir ?? "DESC";
	result.order = [[orderBy, orderDir]];

	return result;
}

/**
 * Build where clause from filter options
 */
function buildWhereClause(
	filters: Omit<AuditFilterOptions, "limit" | "offset" | "orderBy" | "orderDir">,
): Record<string, unknown> {
	const where: Record<string, unknown> = {};

	if (filters.actorId !== undefined) {
		where.actorId = filters.actorId;
	}
	if (filters.action !== undefined) {
		where.action = filters.action;
	}
	if (filters.resourceType !== undefined) {
		where.resourceType = filters.resourceType;
	}
	if (filters.resourceId !== undefined) {
		where.resourceId = filters.resourceId;
	}
	if (filters.startDate !== undefined || filters.endDate !== undefined) {
		const timestampCondition: Record<symbol, Date> = {};
		if (filters.startDate !== undefined) {
			timestampCondition[Op.gte] = filters.startDate;
		}
		if (filters.endDate !== undefined) {
			timestampCondition[Op.lte] = filters.endDate;
		}
		where.timestamp = timestampCondition;
	}

	return where;
}

/**
 * Create an AuditEventDao instance
 */
export function createAuditEventDao(sequelize: Sequelize): AuditEventDao & DaoPostSyncHook {
	const AuditEvents = defineAuditEvents(sequelize);

	return {
		postSync,
		create,
		createBatch,
		getById,
		getByResource,
		getByActor,
		getByAction,
		getByDateRange,
		query,
		count,
		verifyEventIntegrity,
		deleteOlderThan,
	};

	/**
	 * Post-sync hook that sets up monthly partitioning for the audit_events table.
	 * PostgreSQL partitioning improves query performance and enables efficient data retention.
	 */
	async function postSync(_sequelize: Sequelize, _db: Database): Promise<void> {
		try {
			await setupMonthlyPartitioning(sequelize);
		} catch (error) {
			log.error(error, "Failed to setup audit_events partitioning");
		}
	}

	async function create(event: NewAuditEvent): Promise<AuditEvent> {
		const eventHash = computeEventHash(event);
		// Cast to AuditEvent since id and createdAt are auto-generated by Sequelize
		const created = await AuditEvents.create({ ...event, eventHash } as AuditEvent);
		return created.get({ plain: true });
	}

	async function createBatch(events: Array<NewAuditEvent>): Promise<void> {
		if (events.length === 0) {
			return;
		}

		const eventsWithHashes = events.map(event => ({
			...event,
			eventHash: computeEventHash(event),
		}));

		// Cast to AuditEvent[] since id and createdAt are auto-generated by Sequelize
		await AuditEvents.bulkCreate(eventsWithHashes as Array<AuditEvent>);
		log.debug("Created %d audit events in batch", events.length);
	}

	async function getById(id: number): Promise<AuditEvent | undefined> {
		const event = await AuditEvents.findByPk(id);
		return event ? event.get({ plain: true }) : undefined;
	}

	async function getByResource(
		resourceType: AuditResourceType,
		resourceId: string,
		options?: AuditQueryOptions,
	): Promise<Array<AuditEvent>> {
		const events = await AuditEvents.findAll({
			where: { resourceType, resourceId },
			...applyQueryOptions(options),
		});
		return events.map(e => e.get({ plain: true }));
	}

	async function getByActor(actorId: number, options?: AuditQueryOptions): Promise<Array<AuditEvent>> {
		const events = await AuditEvents.findAll({
			where: { actorId },
			...applyQueryOptions(options),
		});
		return events.map(e => e.get({ plain: true }));
	}

	async function getByAction(action: AuditAction, options?: AuditQueryOptions): Promise<Array<AuditEvent>> {
		const events = await AuditEvents.findAll({
			where: { action },
			...applyQueryOptions(options),
		});
		return events.map(e => e.get({ plain: true }));
	}

	async function getByDateRange(
		startDate: Date,
		endDate: Date,
		options?: AuditQueryOptions,
	): Promise<Array<AuditEvent>> {
		const events = await AuditEvents.findAll({
			where: {
				timestamp: {
					[Op.gte]: startDate,
					[Op.lte]: endDate,
				},
			},
			...applyQueryOptions(options),
		});
		return events.map(e => e.get({ plain: true }));
	}

	async function query(filters: AuditFilterOptions): Promise<Array<AuditEvent>> {
		const where = buildWhereClause(filters);
		const events = await AuditEvents.findAll({
			where,
			...applyQueryOptions(filters),
		});
		return events.map(e => e.get({ plain: true }));
	}

	async function count(
		filters?: Omit<AuditFilterOptions, "limit" | "offset" | "orderBy" | "orderDir">,
	): Promise<number> {
		const where = filters ? buildWhereClause(filters) : {};
		return await AuditEvents.count({ where });
	}

	async function verifyEventIntegrity(eventId: number): Promise<boolean> {
		const event = await getById(eventId);
		if (!event) {
			return false;
		}

		const recomputedHash = computeEventHash({
			timestamp: event.timestamp,
			actorId: event.actorId,
			actorType: event.actorType,
			actorEmail: event.actorEmail,
			actorIp: event.actorIp,
			actorDevice: event.actorDevice,
			action: event.action,
			resourceType: event.resourceType,
			resourceId: event.resourceId,
			resourceName: event.resourceName,
			changes: event.changes,
			metadata: event.metadata,
		});

		return event.eventHash === recomputedHash;
	}

	async function deleteOlderThan(days: number): Promise<number> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - days);

		const deleted = await AuditEvents.destroy({
			where: {
				timestamp: {
					[Op.lt]: cutoffDate,
				},
			},
		});

		log.info("Deleted %d audit events older than %d days", deleted, days);
		return deleted;
	}
}

/**
 * Create an AuditEventDao provider for multi-tenant support
 */
export function createAuditEventDaoProvider(defaultDao: AuditEventDao): DaoProvider<AuditEventDao> {
	return {
		getDao(context: TenantOrgContext | undefined): AuditEventDao {
			return context?.database.auditEventDao ?? defaultDao;
		},
	};
}

/**
 * Format a date as YYYY_MM for partition naming
 */
function formatPartitionName(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	return `${year}_${month}`;
}

/**
 * Get the first day of a month
 */
function getMonthStart(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Get the first day of the next month
 */
function getNextMonthStart(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

/**
 * Setup monthly partitioning for the audit_events table.
 *
 * PostgreSQL table partitioning by month provides:
 * - Improved query performance (partition pruning on timestamp queries)
 * - Efficient data retention (drop old partitions instead of DELETE)
 * - Better vacuum/maintenance performance
 *
 * This function:
 * 1. Checks if the table exists
 * 2. If it doesn't exist, creates it as a partitioned table
 * 3. If it exists but is not partitioned, converts it to a partitioned table
 * 4. Creates partitions for the current month and next 2 months
 */
async function setupMonthlyPartitioning(sequelize: Sequelize): Promise<void> {
	// Check if audit_events table exists
	const [tableCheck] = (await sequelize.query(`
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_schema = current_schema()
			AND table_name = 'audit_events'
		) as exists
	`)) as [Array<{ exists: boolean }>, unknown];

	const tableExists = tableCheck[0]?.exists ?? false;

	if (!tableExists) {
		// Table doesn't exist - create it as a partitioned table from scratch
		log.info("Creating audit_events as partitioned table");

		await sequelize.query(`
			-- Create new partitioned table
			CREATE TABLE IF NOT EXISTS audit_events (
				id SERIAL,
				timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
				actor_id INTEGER REFERENCES users(id),
				actor_type VARCHAR(32) NOT NULL,
				actor_email TEXT,
				actor_ip TEXT,
				actor_device TEXT,
				action VARCHAR(64) NOT NULL,
				resource_type VARCHAR(64) NOT NULL,
				resource_id VARCHAR(255) NOT NULL,
				resource_name TEXT,
				changes JSONB,
				metadata JSONB,
				event_hash VARCHAR(64),
				created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
				PRIMARY KEY (id, timestamp)
			) PARTITION BY RANGE (timestamp);

			-- Create indexes for efficient querying
			CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events (timestamp);
			CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events (resource_type, resource_id);
			CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events (actor_id);
			CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events (action);
		`);
	} else {
		// Table exists - check if it's already partitioned
		const [partitionCheck] = (await sequelize.query(`
			SELECT pt.relname as partition_name
			FROM pg_class pc
			JOIN pg_inherits pi ON pc.oid = pi.inhparent
			JOIN pg_class pt ON pi.inhrelid = pt.oid
			WHERE pc.relname = 'audit_events'
			AND pc.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
			LIMIT 1
		`)) as [Array<{ partition_name: string }>, unknown];

		const isPartitioned = partitionCheck.length > 0;

		if (!isPartitioned) {
			// Table exists but is not partitioned - need to convert it
			// This is a complex migration that requires:
			// 1. Rename existing table
			// 2. Create new partitioned table
			// 3. Copy data
			// 4. Drop old table
			log.info("Converting audit_events table to partitioned table");

			await sequelize.query(`
				-- Step 1: Rename existing table
				ALTER TABLE IF EXISTS audit_events RENAME TO audit_events_old;

				-- Step 2: Create new partitioned table
				CREATE TABLE IF NOT EXISTS audit_events (
					id SERIAL,
					timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
					actor_id INTEGER REFERENCES users(id),
					actor_type VARCHAR(32) NOT NULL,
					actor_email TEXT,
					actor_ip TEXT,
					actor_device TEXT,
					action VARCHAR(64) NOT NULL,
					resource_type VARCHAR(64) NOT NULL,
					resource_id VARCHAR(255) NOT NULL,
					resource_name TEXT,
					changes JSONB,
					metadata JSONB,
					event_hash VARCHAR(64),
					created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
					PRIMARY KEY (id, timestamp)
				) PARTITION BY RANGE (timestamp);

				-- Step 3: Create indexes for efficient querying
				CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events (timestamp);
				CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events (resource_type, resource_id);
				CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events (actor_id);
				CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events (action);
			`);

			// Copy data from old table if it has data
			const [countResult] = (await sequelize.query(`
				SELECT COUNT(*)::text as count FROM audit_events_old
			`)) as [Array<{ count: string }>, unknown];

			const rowCount = Number.parseInt(countResult[0]?.count ?? "0", 10);
			if (rowCount > 0) {
				log.info("Migrating %d existing audit events to partitioned table", rowCount);

				// Create partitions for existing data's date range
				const [dateRange] = (await sequelize.query(`
					SELECT
						DATE_TRUNC('month', MIN(timestamp)) as min_month,
						DATE_TRUNC('month', MAX(timestamp)) as max_month
					FROM audit_events_old
				`)) as [Array<{ min_month: Date; max_month: Date }>, unknown];

				if (dateRange[0]?.min_month && dateRange[0]?.max_month) {
					let currentMonth = new Date(dateRange[0].min_month);
					const maxMonth = new Date(dateRange[0].max_month);

					while (currentMonth <= maxMonth) {
						await createPartitionForMonth(sequelize, currentMonth);
						currentMonth = getNextMonthStart(currentMonth);
					}
				}

				// Copy data
				await sequelize.query(`
					INSERT INTO audit_events
					SELECT * FROM audit_events_old
				`);

				log.info("Successfully migrated audit events to partitioned table");
			}

			// Drop old table
			await sequelize.query(`DROP TABLE IF EXISTS audit_events_old`);
		}
	}

	// Ensure partitions exist for current month and next 2 months
	const now = new Date();
	for (let i = 0; i < 3; i++) {
		const targetMonth = new Date(now.getFullYear(), now.getMonth() + i, 1);
		await createPartitionForMonth(sequelize, targetMonth);
	}

	log.info("Audit events table partitioning setup complete");
}

/**
 * Create a partition for a specific month if it doesn't exist
 */
async function createPartitionForMonth(sequelize: Sequelize, month: Date): Promise<void> {
	const partitionName = `audit_events_${formatPartitionName(month)}`;
	const startDate = getMonthStart(month);
	const endDate = getNextMonthStart(month);

	// Check if partition already exists
	const [existsCheck] = (await sequelize.query(
		`
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_schema = current_schema()
			AND table_name = $1
		) as exists
	`,
		{
			bind: [partitionName],
		},
	)) as [Array<{ exists: boolean }>, unknown];

	if (!existsCheck[0]?.exists) {
		const startStr = startDate.toISOString().split("T")[0];
		const endStr = endDate.toISOString().split("T")[0];

		await sequelize.query(`
			CREATE TABLE IF NOT EXISTS ${partitionName}
			PARTITION OF audit_events
			FOR VALUES FROM ('${startStr}') TO ('${endStr}')
		`);

		log.info("Created audit_events partition: %s (%s to %s)", partitionName, startStr, endStr);
	}
}
