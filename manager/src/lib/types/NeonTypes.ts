/**
 * Neon API types and provider configuration types.
 * Based on Neon API v2: https://api-docs.neon.tech/reference/
 */

import type { RegionSlug } from "../constants/Regions";

/**
 * Available Neon AWS regions.
 * @deprecated Use PROVIDER_REGIONS from "../constants/Regions" instead.
 * These are kept for backward compatibility with existing stored configurations.
 */
export const NEON_REGIONS = [
	{ id: "aws-us-east-1", name: "US East (N. Virginia)" },
	{ id: "aws-us-east-2", name: "US East (Ohio)" },
	{ id: "aws-us-west-2", name: "US West (Oregon)" },
	{ id: "aws-eu-central-1", name: "EU (Frankfurt)" },
	{ id: "aws-ap-southeast-1", name: "Asia Pacific (Singapore)" },
	{ id: "aws-ap-southeast-2", name: "Asia Pacific (Sydney)" },
] as const;

/** @deprecated Use RegionSlug from "../constants/Regions" instead */
export type NeonRegionId = (typeof NEON_REGIONS)[number]["id"];

/** Configuration for a Neon provider (API key only) */
export interface NeonProviderConfig {
	/** API key for Neon API authentication */
	apiKey: string;
	/** Organization ID (required for API key authentication) */
	orgId: string;
	/**
	 * Region slug (without aws- prefix) for new projects.
	 * The aws- prefix is added when calling Neon API.
	 */
	regionId?: RegionSlug;
}

/** Connection parameters for a Neon database */
export interface NeonConnectionParameters {
	host: string;
	port?: number;
	database: string;
	role: string;
	password?: string;
}

/** Connection URI info from Neon API */
export interface NeonConnectionUri {
	connection_uri: string;
	connection_parameters: NeonConnectionParameters;
}

/** Neon database info */
export interface NeonDatabase {
	id: number;
	branch_id: string;
	name: string;
	owner_name: string;
	created_at: string;
	updated_at: string;
}

/** Neon role (user) info */
export interface NeonRole {
	branch_id: string;
	name: string;
	password?: string;
	protected: boolean;
	created_at: string;
	updated_at: string;
}

/** Neon branch info */
export interface NeonBranch {
	id: string;
	project_id: string;
	name: string;
	current_state: "init" | "ready" | "unknown";
	pending_state?: "init" | "ready" | "unknown";
	created_at: string;
	updated_at: string;
}

/** Neon endpoint (compute) info */
export interface NeonEndpoint {
	host: string;
	id: string;
	project_id: string;
	branch_id: string;
	autoscaling_limit_min_cu: number;
	autoscaling_limit_max_cu: number;
	region_id: string;
	type: "read_only" | "read_write";
	current_state: "init" | "active" | "idle";
	pending_state?: "init" | "active" | "idle";
	pooler_enabled: boolean;
	pooler_mode: "transaction" | "session";
	disabled: boolean;
	passwordless_access: boolean;
	created_at: string;
	updated_at: string;
}

/** Neon project info (full response) */
export interface NeonProject {
	id: string;
	platform_id: string;
	region_id: string;
	name: string;
	provisioner: "k8s-pod" | "k8s-neonvm";
	pg_version: number;
	proxy_host: string;
	branch_logical_size_limit: number;
	branch_logical_size_limit_bytes: number;
	store_passwords: boolean;
	active_time_seconds: number;
	compute_time_seconds: number;
	written_data_bytes: number;
	data_transfer_bytes: number;
	data_storage_bytes_hour: number;
	cpu_used_sec: number;
	history_retention_seconds: number;
	creation_source: string;
	created_at: string;
	updated_at: string;
	owner_id: string;
}

/** Response from POST /projects (create project) */
export interface NeonCreateProjectResponse {
	project: NeonProject;
	connection_uris: Array<NeonConnectionUri>;
	roles: Array<NeonRole>;
	databases: Array<NeonDatabase>;
	branch: NeonBranch;
	endpoints: Array<NeonEndpoint>;
}

/** Response from GET /projects (list projects) */
export interface NeonListProjectsResponse {
	projects: Array<NeonProject>;
}

/** Response from GET /projects/{project_id} */
export interface NeonGetProjectResponse {
	project: NeonProject;
}

/** Request body for POST /projects (create project) */
export interface NeonCreateProjectRequest {
	project: {
		name?: string;
		region_id?: string;
		pg_version?: number;
		store_passwords?: boolean;
		/** Organization ID (required when using personal API key) */
		org_id?: string;
	};
}
