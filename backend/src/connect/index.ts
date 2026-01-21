// Connect Gateway - Multi-tenant integration support

// Core types and interfaces
export type {
	ConnectCallbackResult,
	ConnectCompleteResult,
	ConnectProvider,
	ConnectStatePayload,
} from "./ConnectProvider";
// Provider registry
export { ConnectProviderRegistry, connectProviderRegistry } from "./ConnectProviderRegistry";
export type { ConnectRouterOptions } from "./ConnectRouter";
// Router
export { createConnectRouter, getConnectGatewayUrl, isConnectGateway } from "./ConnectRouter";
export type { ConnectCodePayload } from "./ConnectStateService";
// State and code encryption service
export {
	generateConnectCode,
	generateConnectState,
	generateEncryptionKey,
	generateSigningKey,
	getProviderKeys,
	isEncryptedState,
	validateConnectCode,
	validateConnectState,
} from "./ConnectStateService";
export type { GitHubConnectCodeData } from "./providers/GitHubConnectProvider";
// Providers
export { GitHubConnectProvider, isMultiTenantEnabled } from "./providers/GitHubConnectProvider";
