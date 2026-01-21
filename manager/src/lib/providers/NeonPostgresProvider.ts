import { env } from "../Config";
import { toNeonRegionId } from "../constants/Regions";
import type { DatabaseCredentials, NeonProviderConfig, ProvisionResult } from "../types";
import type { NeonCreateProjectRequest, NeonCreateProjectResponse, NeonGetProjectResponse } from "../types/NeonTypes";
import { getLog } from "../util/Logger";
import type { DatabaseProviderAdapter, SchemaProvisionResult } from "./DatabaseProviderInterface";
import pg from "pg";

const { Client } = pg;
const log = getLog(import.meta.url);

const NEON_API_BASE = "https://console.neon.tech/api/v2";

/**
 * Database provider that provisions databases using Neon's API.
 * Authenticates via API key.
 */
export class NeonPostgresProvider implements DatabaseProviderAdapter {
	readonly type = "neon" as const;

	private readonly accessToken: string;

	constructor(private readonly config: NeonProviderConfig) {
		log.debug("NeonPostgresProvider constructor - hasApiKey: %s, hasOrgId: %s", !!config.apiKey, !!config.orgId);
		if (!config.apiKey) {
			throw new Error("API key is required for Neon provider");
		}
		if (!config.orgId) {
			log.error("Config missing orgId: %o", config);
			throw new Error("Organization ID is required for Neon provider");
		}
		this.accessToken = config.apiKey;
	}

	/**
	 * Get the access token (API key).
	 */
	private getAccessToken(): string {
		return this.accessToken;
	}

	/**
	 * Make an authenticated request to the Neon API.
	 * Automatically adds org_id query parameter for API operations.
	 */
	private async neonFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
		const token = this.getAccessToken();

		// Build URL with org_id query parameter
		const separator = path.includes("?") ? "&" : "?";
		const url = `${NEON_API_BASE}${path}${separator}org_id=${encodeURIComponent(this.config.orgId)}`;

		log.debug("Neon API request: %s %s", options.method ?? "GET", url);

		const response = await fetch(url, {
			...options,
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				Accept: "application/json",
				...options.headers,
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			log.error("Neon API error: %s %s - %s %s", options.method ?? "GET", path, response.status, errorText);
			throw new Error(`Neon API error: ${response.status} ${errorText}`);
		}

		return (await response.json()) as T;
	}

	async provisionDatabase(
		providerSlug: string,
		options?: { reuseExisting?: boolean; force?: boolean },
	): Promise<ProvisionResult> {
		// Validate orgId is in the allowed list (if restrictions are configured)
		if (env.ALLOWED_NEON_ORG_IDS.length > 0 && !env.ALLOWED_NEON_ORG_IDS.includes(this.config.orgId)) {
			log.error(
				"Neon Org ID '%s' is not in the allowed orgs list: %o",
				this.config.orgId,
				env.ALLOWED_NEON_ORG_IDS,
			);
			return {
				success: false,
				error: `Neon Org ID '${this.config.orgId}' is not in the allowed orgs list for this environment`,
			};
		}

		const projectName = `jolli-${providerSlug}`;
		const reuseExisting = options?.reuseExisting ?? false;
		const force = options?.force ?? false;

		log.info(
			"Provisioning Neon project for provider: %s (reuseExisting: %s, force: %s)",
			providerSlug,
			reuseExisting,
			force,
		);

		try {
			// Check if project already exists by listing projects
			if (reuseExisting || force) {
				const existingProject = await this.findProjectByName(projectName);
				if (existingProject) {
					if (force) {
						log.warn("Project %s exists, force=true so deleting and recreating...", projectName);
						await this.deleteProject(existingProject.id);
					} else if (reuseExisting) {
						log.info("Project %s exists, attempting to reuse...", projectName);
						// Get connection details from existing project
						const credentials = await this.getProjectCredentials(existingProject.id);
						if (credentials) {
							return {
								success: true,
								credentials,
								reused: true,
							};
						}
						log.warn("Could not get credentials for existing project %s", projectName);
					}
				}
			}

			// Create new Neon project
			const request: NeonCreateProjectRequest = {
				project: {
					name: projectName,
					// Include org_id in request body
					org_id: this.config.orgId,
					// Use configured region if specified (convert slug to Neon region ID by adding aws- prefix)
					...(this.config.regionId ? { region_id: toNeonRegionId(this.config.regionId) } : {}),
				},
			};

			log.debug("Creating Neon project with request: %o", request);

			const response = await this.neonFetch<NeonCreateProjectResponse>("/projects", {
				method: "POST",
				body: JSON.stringify(request),
			});

			log.info("Created Neon project: %s (id: %s)", response.project.name, response.project.id);

			const projectId = response.project.id;

			// Extract connection credentials from the response
			if (!response.connection_uris || response.connection_uris.length === 0) {
				return {
					success: false,
					error: "Neon project created but no connection URI returned",
					resourceId: projectId,
				};
			}

			const connectionUri = response.connection_uris[0];
			const params = connectionUri.connection_parameters;

			// Get the password from the roles array if not in connection_parameters
			let password = params.password;
			if (!password && response.roles.length > 0) {
				password = response.roles[0].password;
			}

			if (!password) {
				return {
					success: false,
					error: "Neon project created but no password returned",
					resourceId: projectId,
				};
			}

			const credentials: DatabaseCredentials = {
				host: params.host,
				port: params.port ?? 5432,
				database: params.database,
				username: params.role,
				password,
				ssl: true, // Neon always uses SSL
			};

			// Enable pgvector extension in public schema immediately after database creation.
			// This ensures the extension is owned by the initial database user and accessible
			// to all schemas via search_path. Neon has pgvector pre-installed but not enabled.
			const client = new Client({
				host: credentials.host,
				port: credentials.port,
				database: credentials.database,
				user: credentials.username,
				password: credentials.password,
				ssl: { rejectUnauthorized: false },
			});

			try {
				await client.connect();
				log.info("Enabling pgvector extension in public schema");
				await client.query("CREATE EXTENSION IF NOT EXISTS vector SCHEMA public");
			} finally {
				await client.end();
			}

			log.info("Provisioning complete for provider: %s", providerSlug);

			return {
				success: true,
				credentials,
				resourceId: projectId,
			};
		} catch (error) {
			log.error({ err: error }, "Provisioning error");
			const message = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: `Failed to provision Neon database: ${message}`,
			};
		}
	}

	/**
	 * Find a project by name.
	 */
	private async findProjectByName(name: string): Promise<{ id: string; name: string } | null> {
		try {
			const response = await this.neonFetch<{ projects: Array<{ id: string; name: string }> }>("/projects");
			return response.projects.find(p => p.name === name) ?? null;
		} catch {
			return null;
		}
	}

	/**
	 * Delete a Neon project. Public to allow cleanup on provisioning failure.
	 */
	async deleteProject(projectId: string): Promise<void> {
		await this.neonFetch(`/projects/${projectId}`, { method: "DELETE" });
		log.info("Deleted Neon project: %s", projectId);
	}

	/**
	 * Delete a Neon project by resource ID (implements DatabaseProviderAdapter.deleteResource).
	 * Used for cleanup when provisioning fails after project creation.
	 */
	deleteResource(resourceId: string): Promise<void> {
		return this.deleteProject(resourceId);
	}

	/**
	 * Get credentials for an existing project.
	 */
	private async getProjectCredentials(projectId: string): Promise<DatabaseCredentials | null> {
		try {
			// Fetch project to ensure it exists (result unused but validates access)
			await this.neonFetch<NeonGetProjectResponse>(`/projects/${projectId}`);

			// Get branches to find the default branch
			const branches = await this.neonFetch<{ branches: Array<{ id: string; name: string }> }>(
				`/projects/${projectId}/branches`,
			);
			if (branches.branches.length === 0) {
				return null;
			}
			const defaultBranch = branches.branches[0];

			// Get endpoints for the branch
			const endpoints = await this.neonFetch<{ endpoints: Array<{ host: string }> }>(
				`/projects/${projectId}/branches/${defaultBranch.id}/endpoints`,
			);
			if (endpoints.endpoints.length === 0) {
				return null;
			}
			const endpoint = endpoints.endpoints[0];

			// Get roles
			const roles = await this.neonFetch<{ roles: Array<{ name: string; password?: string }> }>(
				`/projects/${projectId}/branches/${defaultBranch.id}/roles`,
			);
			if (roles.roles.length === 0) {
				return null;
			}
			const role = roles.roles.find(r => !r.name.startsWith("postgres")) ?? roles.roles[0];

			// Get databases
			const databases = await this.neonFetch<{ databases: Array<{ name: string }> }>(
				`/projects/${projectId}/branches/${defaultBranch.id}/databases`,
			);
			const database = databases.databases.find(d => d.name !== "postgres") ?? { name: "neondb" };

			// Note: We can't get the password for existing roles via API
			// The user would need to reset the password or we'd need to store it
			if (!role.password) {
				log.warn("Cannot retrieve password for existing Neon project role");
				return null;
			}

			return {
				host: endpoint.host,
				port: 5432,
				database: database.name,
				username: role.name,
				password: role.password,
				ssl: true,
			};
		} catch (error) {
			log.error({ err: error }, "Error getting project credentials");
			return null;
		}
	}

	async deprovisionDatabase(
		providerSlug: string,
		_credentials: DatabaseCredentials,
		mode: "drop" | "retain" = "drop",
	): Promise<void> {
		if (mode === "retain") {
			log.info("Deprovision mode is 'retain', skipping Neon project deletion for provider %s", providerSlug);
			return;
		}

		const projectName = `jolli-${providerSlug}`;
		log.info("Deprovisioning Neon project for provider: %s", providerSlug);

		const project = await this.findProjectByName(projectName);
		if (!project) {
			log.warn("Neon project %s not found, nothing to deprovision", projectName);
			return;
		}

		await this.deleteProject(project.id);
		log.info("Neon project %s deprovisioned successfully", projectName);
	}

	async testConnection(credentials: DatabaseCredentials): Promise<boolean> {
		const client = new Client({
			host: credentials.host,
			port: credentials.port,
			database: credentials.database,
			user: credentials.username,
			password: credentials.password,
			ssl: { rejectUnauthorized: false },
		});

		try {
			await client.connect();
			await client.query("SELECT 1");
			return true;
		} catch {
			return false;
		} finally {
			await client.end();
		}
	}

	migrate(_credentials: DatabaseCredentials): Promise<void> {
		// Migrations are handled by the backend when it connects
		throw new Error("Migration not yet implemented - requires backend integration");
	}

	async provisionSchema(
		credentials: DatabaseCredentials,
		schemaName: string,
		options?: { reuseExisting?: boolean; force?: boolean },
	): Promise<SchemaProvisionResult> {
		log.info(
			"Provisioning schema %s in Neon database %s (reuseExisting: %s, force: %s)",
			schemaName,
			credentials.database,
			options?.reuseExisting ?? false,
			options?.force ?? false,
		);

		// Check if schema already exists
		const schemaExists = await this.checkSchemaExists(credentials, schemaName);

		// If schema exists and force=true, drop it first
		if (schemaExists && options?.force) {
			log.info("Schema %s exists and force=true, dropping existing schema", schemaName);
			await this.deprovisionSchema(credentials, schemaName, "drop");
		}

		// If schema exists and no force, return early (reuse)
		if (schemaExists && !options?.force) {
			log.info("Schema %s already exists, reusing (created=false, existed=true)", schemaName);
			return { created: false, existed: true };
		}

		const client = new Client({
			host: credentials.host,
			port: credentials.port,
			database: credentials.database,
			user: credentials.username,
			password: credentials.password,
			ssl: { rejectUnauthorized: false },
		});

		try {
			await client.connect();

			// Note: pgvector extension is created in provisionDatabase() so it's owned by the
			// initial database user and accessible to all schemas. No need to create it here.

			// Skip schema creation for "public" schema
			if (schemaName === "public") {
				log.info("Using existing public schema for database %s", credentials.database);
				return { created: false, existed: true };
			}

			await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
			log.info("Schema %s provisioned successfully (created=true, existed=%s)", schemaName, schemaExists);
			return { created: true, existed: schemaExists };
		} finally {
			await client.end();
		}
	}

	async deprovisionSchema(
		credentials: DatabaseCredentials,
		schemaName: string,
		mode: "drop" | "retain" = "drop",
	): Promise<void> {
		if (mode === "retain") {
			log.info("Deprovision mode is 'retain', skipping schema deletion for %s", schemaName);
			return;
		}

		log.info("Deprovisioning schema %s in Neon database %s", schemaName, credentials.database);

		const client = new Client({
			host: credentials.host,
			port: credentials.port,
			database: credentials.database,
			user: credentials.username,
			password: credentials.password,
			ssl: { rejectUnauthorized: false },
		});

		try {
			await client.connect();
			await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
			log.info("Schema %s deprovisioned successfully", schemaName);
		} finally {
			await client.end();
		}
	}

	migrateSchema(_credentials: DatabaseCredentials, _schemaName: string): Promise<void> {
		throw new Error("Schema migration not yet implemented - requires backend integration");
	}

	async checkDatabaseExists(dbName: string): Promise<boolean> {
		// In Neon, we check if the project exists
		const projectName = dbName.startsWith("jolli-") ? dbName : `jolli-${dbName}`;
		const project = await this.findProjectByName(projectName);
		return project !== null;
	}

	async checkSchemaExists(credentials: DatabaseCredentials, schemaName: string): Promise<boolean> {
		const client = new Client({
			host: credentials.host,
			port: credentials.port,
			database: credentials.database,
			user: credentials.username,
			password: credentials.password,
			ssl: { rejectUnauthorized: false },
		});

		try {
			await client.connect();
			const result = await client.query("SELECT 1 FROM information_schema.schemata WHERE schema_name = $1", [
				schemaName,
			]);
			return result.rowCount !== null && result.rowCount > 0;
		} finally {
			await client.end();
		}
	}

	async validateJolliDatabase(
		credentials: DatabaseCredentials,
	): Promise<{ valid: boolean; missingTables?: Array<string> }> {
		const expectedTables = [
			"docs",
			"docsites",
			"jobs",
			"integrations",
			"users",
			"chunks",
			"sites",
			"convos",
			"github_installations",
			"visits",
		];

		const client = new Client({
			host: credentials.host,
			port: credentials.port,
			database: credentials.database,
			user: credentials.username,
			password: credentials.password,
			ssl: { rejectUnauthorized: false },
		});

		try {
			await client.connect();
			const result = await client.query(
				"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
			);
			const existingTables = new Set(result.rows.map(row => row.table_name));
			const missingTables = expectedTables.filter(table => !existingTables.has(table));

			if (missingTables.length > 0) {
				log.warn("Database validation failed. Missing tables: %o", missingTables);
				return { valid: false, missingTables };
			}

			log.info("Database validation passed. All expected Jolli tables found.");
			return { valid: true };
		} catch (error) {
			log.error({ err: error }, "Error validating Jolli database");
			return { valid: false, missingTables: expectedTables };
		} finally {
			await client.end();
		}
	}
}
