import type { AuditAction, AuditEvent, AuditResourceType, NewAuditEvent } from "../model/AuditEvent";
import type { AuditEventDao, AuditFilterOptions, AuditQueryOptions } from "./AuditEventDao";

/**
 * Creates a mock AuditEventDao for testing
 */
export function mockAuditEventDao(): AuditEventDao {
	const events: Array<AuditEvent> = [];
	let nextId = 1;

	return {
		create(event: NewAuditEvent): Promise<AuditEvent> {
			const newEvent: AuditEvent = {
				...event,
				id: nextId++,
				eventHash: `hash-${nextId}`,
				createdAt: new Date(),
			};
			events.push(newEvent);
			return Promise.resolve(newEvent);
		},

		async createBatch(newEvents: Array<NewAuditEvent>): Promise<void> {
			for (const event of newEvents) {
				await this.create(event);
			}
		},

		getById(id: number): Promise<AuditEvent | undefined> {
			return Promise.resolve(events.find(e => e.id === id));
		},

		getByResource(
			resourceType: AuditResourceType,
			resourceId: string,
			_options?: AuditQueryOptions,
		): Promise<Array<AuditEvent>> {
			return Promise.resolve(events.filter(e => e.resourceType === resourceType && e.resourceId === resourceId));
		},

		getByActor(actorId: number, _options?: AuditQueryOptions): Promise<Array<AuditEvent>> {
			return Promise.resolve(events.filter(e => e.actorId === actorId));
		},

		getByAction(action: AuditAction, _options?: AuditQueryOptions): Promise<Array<AuditEvent>> {
			return Promise.resolve(events.filter(e => e.action === action));
		},

		getByDateRange(startDate: Date, endDate: Date, _options?: AuditQueryOptions): Promise<Array<AuditEvent>> {
			return Promise.resolve(events.filter(e => e.timestamp >= startDate && e.timestamp <= endDate));
		},

		query(filters: AuditFilterOptions): Promise<Array<AuditEvent>> {
			let result = [...events];
			if (filters.actorId !== undefined) {
				result = result.filter(e => e.actorId === filters.actorId);
			}
			if (filters.action !== undefined) {
				result = result.filter(e => e.action === filters.action);
			}
			if (filters.resourceType !== undefined) {
				result = result.filter(e => e.resourceType === filters.resourceType);
			}
			if (filters.resourceId !== undefined) {
				result = result.filter(e => e.resourceId === filters.resourceId);
			}
			if (filters.startDate !== undefined) {
				const startDate = filters.startDate;
				result = result.filter(e => e.timestamp >= startDate);
			}
			if (filters.endDate !== undefined) {
				const endDate = filters.endDate;
				result = result.filter(e => e.timestamp <= endDate);
			}
			if (filters.limit !== undefined) {
				result = result.slice(filters.offset ?? 0, (filters.offset ?? 0) + filters.limit);
			}
			return Promise.resolve(result);
		},

		count(filters?: Omit<AuditFilterOptions, "limit" | "offset" | "orderBy" | "orderDir">): Promise<number> {
			if (!filters) {
				return Promise.resolve(events.length);
			}
			// Filter events based on the provided filters
			let result = [...events];
			if (filters.actorId !== undefined) {
				result = result.filter(e => e.actorId === filters.actorId);
			}
			if (filters.action !== undefined) {
				result = result.filter(e => e.action === filters.action);
			}
			if (filters.resourceType !== undefined) {
				result = result.filter(e => e.resourceType === filters.resourceType);
			}
			if (filters.resourceId !== undefined) {
				result = result.filter(e => e.resourceId === filters.resourceId);
			}
			if (filters.startDate !== undefined) {
				const startDate = filters.startDate;
				result = result.filter(e => e.timestamp >= startDate);
			}
			if (filters.endDate !== undefined) {
				const endDate = filters.endDate;
				result = result.filter(e => e.timestamp <= endDate);
			}
			return Promise.resolve(result.length);
		},

		verifyEventIntegrity(_eventId: number): Promise<boolean> {
			return Promise.resolve(true);
		},

		deleteOlderThan(_days: number): Promise<number> {
			return Promise.resolve(0);
		},
	};
}
