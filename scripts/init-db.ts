#!/usr/bin/env -S node --import tsx
/**
 * Database Initialization Script
 *
 * This script initializes the database schema for a Jolli deployment.
 * It can load credentials from:
 * 1. AWS Parameter Store (--source aws --site prod|preview|staging)
 * 2. Vercel environment variables (--source vercel)
 * 3. Interactive prompts (--source prompt)
 * 4. Environment variables (default)
 *
 * Usage:
 *   npx tsx scripts/init-db.ts --source aws --site prod
 *   npx tsx scripts/init-db.ts --source vercel
 *   npx tsx scripts/init-db.ts --source prompt
 *   npx tsx scripts/init-db.ts  # uses current env vars
 */

import { GetParametersByPathCommand, SSMClient } from "@aws-sdk/client-ssm";
import { execSync } from "node:child_process";
import * as readline from "node:readline";
import { Sequelize } from "sequelize";

// Color helpers for terminal output
const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
};

function log(message: string, color = ""): void {
	console.log(`${color}${message}${colors.reset}`);
}

function logStep(step: string): void {
	log(`\n${colors.bright}${colors.blue}>>> ${step}${colors.reset}`);
}

function logSuccess(message: string): void {
	log(`${colors.green}${colors.bright}${message}${colors.reset}`);
}

function logError(message: string): void {
	log(`${colors.red}${colors.bright}ERROR: ${message}${colors.reset}`);
}

function logWarn(message: string): void {
	log(`${colors.yellow}${colors.bright}WARNING: ${message}${colors.reset}`);
}

interface PostgresConfig {
	host: string;
	port: number;
	database: string;
	username: string;
	password: string;
	ssl: boolean;
	query?: string;
}

/**
 * Parse command line arguments
 */
function parseArgs(): { source: string; site: string; dryRun: boolean; force: boolean } {
	const args = process.argv.slice(2);
	let source = "env";
	let site = "prod";
	let dryRun = false;
	let force = false;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--source" && args[i + 1]) {
			source = args[++i];
		} else if (args[i] === "--site" && args[i + 1]) {
			site = args[++i];
		} else if (args[i] === "--dry-run") {
			dryRun = true;
		} else if (args[i] === "--force") {
			force = true;
		} else if (args[i] === "--help" || args[i] === "-h") {
			console.log(`
Database Initialization Script

Usage: npx tsx scripts/init-db.ts [options]

Options:
  --source <type>   Where to get credentials from:
                    - aws: Load from AWS Parameter Store
                    - vercel: Load from Vercel environment variables
                    - prompt: Interactive prompts
                    - env: Use current environment variables (default)
  --site <name>     Site environment (prod, preview, staging). Used with --source aws
  --dry-run         Show what would be done without making changes
  --force           Drop and recreate tables (DANGEROUS - data loss!)
  --help, -h        Show this help message

Examples:
  npx tsx scripts/init-db.ts --source aws --site prod
  npx tsx scripts/init-db.ts --source vercel
  npx tsx scripts/init-db.ts --source prompt
  npx tsx scripts/init-db.ts --dry-run
`);
			process.exit(0);
		}
	}

	return { source, site, dryRun, force };
}

/**
 * Load credentials from AWS Parameter Store
 */
async function loadFromAws(site: string): Promise<PostgresConfig> {
	logStep(`Loading credentials from AWS Parameter Store (/jolli/vercel/${site}/)`);

	const client = new SSMClient({ region: "us-west-2" });
	const prefix = `/jolli/vercel/${site}/`;
	const params: Record<string, string> = {};

	// Handle pagination - AWS returns max 10 parameters per request
	let nextToken: string | undefined;
	do {
		const command = new GetParametersByPathCommand({
			Path: prefix,
			Recursive: true,
			WithDecryption: true,
			NextToken: nextToken,
		});

		const response = await client.send(command);

		for (const param of response.Parameters || []) {
			if (param.Name && param.Value) {
				// Convert /jolli/vercel/prod/postgres/host -> POSTGRES_HOST
				const envKey = param.Name.replace(prefix, "")
					.replace(/\//g, "_")
					.toUpperCase();
				params[envKey] = param.Value;
			}
		}

		nextToken = response.NextToken;
	} while (nextToken);

	log(`  Loaded ${Object.keys(params).length} parameters from AWS`, colors.dim);

	// Set all loaded parameters as environment variables for backend Config
	for (const [key, value] of Object.entries(params)) {
		process.env[key] = value;
	}

	return {
		host: params.POSTGRES_HOST || "",
		port: Number.parseInt(params.POSTGRES_PORT || "5432"),
		database: params.POSTGRES_DATABASE || "",
		username: params.POSTGRES_USERNAME || "",
		password: params.POSTGRES_PASSWORD || "",
		ssl: params.POSTGRES_QUERY?.includes("ssl") ?? true,
		query: params.POSTGRES_QUERY,
	};
}

/**
 * Load credentials from Vercel environment variables
 */
async function loadFromVercel(): Promise<PostgresConfig> {
	logStep("Loading credentials from Vercel environment variables");

	try {
		const output = execSync("vercel env pull --yes /dev/stdout 2>/dev/null", {
			encoding: "utf-8",
		});

		const params: Record<string, string> = {};
		for (const line of output.split("\n")) {
			const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
			if (match) {
				params[match[1]] = match[2];
			}
		}

		log(`  Loaded ${Object.keys(params).length} variables from Vercel`, colors.dim);

		return {
			host: params.POSTGRES_HOST || "",
			port: Number.parseInt(params.POSTGRES_PORT || "5432"),
			database: params.POSTGRES_DATABASE || "",
			username: params.POSTGRES_USERNAME || "",
			password: params.POSTGRES_PASSWORD || "",
			ssl: params.POSTGRES_QUERY?.includes("ssl") ?? true,
			query: params.POSTGRES_QUERY,
		};
	} catch (error) {
		throw new Error("Failed to load from Vercel. Make sure you're logged in with `vercel login`");
	}
}

/**
 * Prompt user for credentials interactively
 */
async function loadFromPrompt(): Promise<PostgresConfig> {
	logStep("Interactive credential entry");

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const question = (prompt: string, defaultValue = ""): Promise<string> => {
		return new Promise((resolve) => {
			const defaultText = defaultValue ? ` [${defaultValue}]` : "";
			rl.question(`${prompt}${defaultText}: `, (answer) => {
				resolve(answer || defaultValue);
			});
		});
	};

	console.log("\nEnter PostgreSQL connection details:");
	console.log("(Press Enter to use default values shown in brackets)\n");

	const host = await question("Host", "localhost");
	const port = await question("Port", "5432");
	const database = await question("Database", "jolli");
	const username = await question("Username", "postgres");
	const password = await question("Password");
	const ssl = await question("Use SSL? (yes/no)", "yes");
	const query = await question("Query params (e.g., sslmode=require)", ssl.toLowerCase() === "yes" ? "sslmode=require" : "");

	rl.close();

	return {
		host,
		port: Number.parseInt(port),
		database,
		username,
		password,
		ssl: ssl.toLowerCase() === "yes",
		query,
	};
}

/**
 * Load credentials from current environment
 */
function loadFromEnv(): PostgresConfig {
	logStep("Loading credentials from environment variables");

	return {
		host: process.env.POSTGRES_HOST || "",
		port: Number.parseInt(process.env.POSTGRES_PORT || "5432"),
		database: process.env.POSTGRES_DATABASE || "",
		username: process.env.POSTGRES_USERNAME || "",
		password: process.env.POSTGRES_PASSWORD || "",
		ssl: process.env.POSTGRES_QUERY?.includes("ssl") ?? false,
		query: process.env.POSTGRES_QUERY,
	};
}

/**
 * Validate PostgreSQL configuration
 */
function validateConfig(config: PostgresConfig): string[] {
	const errors: string[] = [];
	if (!config.host) errors.push("POSTGRES_HOST is required");
	if (!config.database) errors.push("POSTGRES_DATABASE is required");
	if (!config.username) errors.push("POSTGRES_USERNAME is required");
	if (!config.password) errors.push("POSTGRES_PASSWORD is required");
	return errors;
}

/**
 * Create Sequelize connection
 */
function createSequelize(config: PostgresConfig): Sequelize {
	const queryPart = config.query ? `?${config.query}` : "";
	const uri = `postgres://${config.username}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}${queryPart}`;

	return new Sequelize(uri, {
		dialect: "postgres",
		dialectOptions: config.ssl ? { ssl: { rejectUnauthorized: false } } : {},
		logging: false,
		define: { underscored: true },
	});
}

/**
 * Initialize database schema using the backend's createDatabase
 */
async function initializeDatabase(sequelize: Sequelize, force: boolean, dryRun: boolean): Promise<void> {
	// For force mode, drop all tables first
	if (force) {
		logStep("Dropping all tables (force mode)");
		logWarn("This will DELETE ALL DATA in the database!");
		if (!dryRun) {
			await sequelize.drop();
			logSuccess("  All tables dropped");
		} else {
			log("  [DRY RUN] Would drop all tables", colors.yellow);
		}
	}

	// Import the backend's createDatabase function which initializes all models and syncs
	logStep("Initializing database using backend/src/core/Database.ts");

	if (dryRun) {
		log("  [DRY RUN] Would initialize database models and sync schema", colors.yellow);
		return;
	}

	// Ensure sync is enabled (override Vercel environment checks)
	delete process.env.SKIP_SEQUELIZE_SYNC;
	delete process.env.VERCEL;
	delete process.env.VERCEL_DEPLOYMENT;

	const { createDatabase } = await import("../backend/src/core/Database");
	await createDatabase(sequelize);
	logSuccess("  Database schema synchronized successfully");
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
	console.log(`
${colors.bright}${colors.cyan}========================================
  Jolli Database Initialization Script
========================================${colors.reset}
`);

	const { source, site, dryRun, force } = parseArgs();

	if (dryRun) {
		logWarn("DRY RUN MODE - No changes will be made\n");
	}

	// Load configuration based on source
	let config: PostgresConfig;
	try {
		switch (source) {
			case "aws":
				config = await loadFromAws(site);
				break;
			case "vercel":
				config = await loadFromVercel();
				break;
			case "prompt":
				config = await loadFromPrompt();
				break;
			case "env":
			default:
				config = loadFromEnv();
				break;
		}
	} catch (error) {
		logError(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}

	// Validate configuration
	const errors = validateConfig(config);
	if (errors.length > 0) {
		logError("Invalid configuration:");
		for (const err of errors) {
			log(`  - ${err}`, colors.red);
		}
		process.exit(1);
	}

	// Show connection info (without password)
	logStep("Connection details");
	log(`  Host:     ${config.host}`, colors.dim);
	log(`  Port:     ${config.port}`, colors.dim);
	log(`  Database: ${config.database}`, colors.dim);
	log(`  Username: ${config.username}`, colors.dim);
	log(`  SSL:      ${config.ssl ? "enabled" : "disabled"}`, colors.dim);

	// Create Sequelize connection
	logStep("Testing database connection");
	const sequelize = createSequelize(config);

	try {
		await sequelize.authenticate();
		logSuccess("  Connection successful!");
	} catch (error) {
		logError(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}

	// Initialize database
	try {
		await initializeDatabase(sequelize, force, dryRun);
	} catch (error) {
		logError(`Schema initialization failed: ${error instanceof Error ? error.message : String(error)}`);
		await sequelize.close();
		process.exit(1);
	}

	// Close connection
	await sequelize.close();

	console.log(`
${colors.bright}${colors.green}========================================
  Database initialization complete!
========================================${colors.reset}
`);
}

main().catch((error) => {
	logError(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
