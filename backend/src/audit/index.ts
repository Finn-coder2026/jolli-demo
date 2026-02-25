// Audit trail module exports

export type { AuditRequestContext } from "./AuditContext";
export {
	createInitialAuditContext,
	getAuditContext,
	requireAuditContext,
	runWithAuditContext,
	updateAuditContextActor,
} from "./AuditContext";
export {
	createAuditMiddleware,
	createAuditUserMiddleware,
	createSchedulerActorMiddleware,
	createSystemActorMiddleware,
	createWebhookActorMiddleware,
} from "./AuditMiddleware";
export type { AuditLogParams, AuditService } from "./AuditService";
export {
	auditLog,
	auditLogSync,
	computeAuditChanges,
	createAuditService,
	generateAuditPiiEncryptionKey,
	getAuditService,
	getAuditServiceOrNull,
	setGlobalAuditService,
} from "./AuditService";
export type { PIIFieldOptions } from "./PiiDecorators";
export {
	clearPiiRegistry,
	getRegisteredPiiFields,
	getRegisteredResourceTypes,
	isRegisteredPiiField,
	PIIField,
	PIISchema,
	registerPiiFields,
} from "./PiiDecorators";
export {
	ACTOR_PII_FIELDS,
	GLOBAL_PII_FIELDS,
	getPiiFieldsForResource,
	isActorPiiField,
	isPiiField,
} from "./PiiDefinitions";
