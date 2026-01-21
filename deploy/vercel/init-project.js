#!/usr/bin/env node
/**
 * Vercel Project Initialization Script
 *
 * Sets up a Vercel project for Jolli with environment variables
 * that enable AWS Parameter Store access via OIDC federation.
 *
 * If deploy/vercel/env.json exists, it reads config from there.
 * Otherwise, it prompts interactively and saves to env.json.
 *
 * Usage:
 *   npm run vercel:init         # Interactive mode (or reads from env.json if exists)
 *   npm run vercel:init --help  # Show help
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");
const vercelDir = join(rootDir, ".vercel");
const projectJsonPath = join(vercelDir, "project.json");
const configFilePath = join(__dirname, "env.json");

// Terminal colors
const colors = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	cyan: "\x1b[36m",
};

// Shared environment variables (same for all environments)
const SHARED_VAR_CONFIG = {
	AWS_OIDC_ROLE_ARN: {
		required: true,
		description: "IAM role ARN for OIDC federation",
		validate: validateArn,
	},
	AWS_REGION: {
		required: false,
		default: "us-west-2",
		description: "AWS region for Parameter Store",
	},
	LOG_TRANSPORTS: {
		required: false,
		default: "console",
		description: "Logging transports (e.g., console, file)",
	},
};

// Per-environment variables
const PER_ENV_VAR_CONFIG = {
	PSTORE_ENV: {
		required: true,
		description: "Parameter Store environment name",
		defaults: {
			production: "prod",
			preview: "preview",
			development: "dev",
		},
	},
	NODE_ENV: {
		required: false,
		description: "Node environment",
		defaults: {
			production: "production",
			preview: "production",
			development: "development",
		},
	},
};

const ENVIRONMENTS = ["production", "preview", "development"];

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs() {
	const args = process.argv.slice(2);
	return {
		help: args.includes("--help") || args.includes("-h"),
	};
}

function showHelp() {
	console.log(`
${colors.bold}Jolli Vercel Project Initialization${colors.reset}

Sets up a Vercel project with environment variables for AWS Parameter Store access.

${colors.bold}Usage:${colors.reset}
  npm run vercel:init         # Initialize project
  npm run vercel:init --help  # Show this help

${colors.bold}Behavior:${colors.reset}
  - If deploy/vercel/env.json exists, reads configuration from it
  - Otherwise, prompts interactively and saves answers to env.json

${colors.bold}Config File Format (env.json):${colors.reset}
  {
    "shared": {
      "AWS_OIDC_ROLE_ARN": "arn:aws:iam::123456789012:role/MyRole",
      "AWS_REGION": "us-west-2"
    },
    "production": { "PSTORE_ENV": "prod", "NODE_ENV": "production" },
    "preview": { "PSTORE_ENV": "preview", "NODE_ENV": "production" },
    "development": { "PSTORE_ENV": "dev", "NODE_ENV": "development" }
  }
`);
}

// ============================================================================
// Validation
// ============================================================================

function validateArn(arn) {
	const arnPattern = /^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/;
	if (!arnPattern.test(arn)) {
		return "Invalid ARN format. Expected: arn:aws:iam::<account-id>:role/<role-name>";
	}
	return null;
}

function validateConfig(config) {
	const errors = [];

	// Validate shared variables
	const shared = config.shared || {};
	for (const [varName, varConfig] of Object.entries(SHARED_VAR_CONFIG)) {
		if (varConfig.required && !shared[varName]) {
			errors.push(`Missing required shared variable '${varName}'`);
		}
		if (shared[varName] && varConfig.validate) {
			const validationError = varConfig.validate(shared[varName]);
			if (validationError) {
				errors.push(`Invalid shared '${varName}': ${validationError}`);
			}
		}
	}

	// Validate per-environment variables
	for (const env of ENVIRONMENTS) {
		const envConfig = config[env];
		if (!envConfig) {
			errors.push(`Missing configuration for environment: ${env}`);
			continue;
		}

		for (const [varName, varConfig] of Object.entries(PER_ENV_VAR_CONFIG)) {
			if (varConfig.required && !envConfig[varName]) {
				errors.push(`Missing required variable '${varName}' for environment '${env}'`);
			}
		}
	}

	return errors;
}

// ============================================================================
// Config Loading and Saving
// ============================================================================

function loadConfigFromFile() {
	if (!existsSync(configFilePath)) {
		return null;
	}

	console.log(`${colors.cyan}Found env.json, loading configuration...${colors.reset}`);
	const fileConfig = JSON.parse(readFileSync(configFilePath, "utf-8"));
	const config = {
		shared: {},
		production: {},
		preview: {},
		development: {},
	};

	// Load shared variables
	if (fileConfig.shared) {
		config.shared = { ...fileConfig.shared };
	}

	// Apply defaults for missing shared values
	for (const [varName, varConfig] of Object.entries(SHARED_VAR_CONFIG)) {
		if (!config.shared[varName] && varConfig.default) {
			config.shared[varName] = varConfig.default;
		}
	}

	// Load per-environment variables
	for (const env of ENVIRONMENTS) {
		if (fileConfig[env]) {
			config[env] = { ...fileConfig[env] };
		}
	}

	// Apply defaults for missing per-environment values
	for (const env of ENVIRONMENTS) {
		for (const [varName, varConfig] of Object.entries(PER_ENV_VAR_CONFIG)) {
			if (!config[env][varName] && varConfig.defaults?.[env]) {
				config[env][varName] = varConfig.defaults[env];
			}
		}
	}

	return config;
}

function saveConfig(config) {
	const dir = dirname(configFilePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	writeFileSync(configFilePath, `${JSON.stringify(config, null, "\t")}\n`);
	console.log(`${colors.green}Saved config to:${colors.reset} ${configFilePath}`);
}

// ============================================================================
// Interactive Prompts
// ============================================================================

let rl = null;

function getReadline() {
	if (!rl) {
		rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		});
	}
	return rl;
}

function closeReadline() {
	if (rl) {
		rl.close();
		rl = null;
	}
}

function prompt(message, defaultValue = "") {
	const readline = getReadline();
	const defaultText = defaultValue ? ` [${defaultValue}]` : "";

	return new Promise(resolve => {
		readline.question(`${message}${defaultText}: `, answer => {
			resolve(answer.trim() || defaultValue);
		});
	});
}

async function promptChoice(message, choices) {
	console.log(`\n${message}`);
	for (let i = 0; i < choices.length; i++) {
		console.log(`  [${i + 1}] ${choices[i]}`);
	}

	while (true) {
		const answer = await prompt("Select option");
		const choice = Number.parseInt(answer, 10);
		if (choice >= 1 && choice <= choices.length) {
			return choice - 1;
		}
		console.log(`${colors.yellow}Please enter a number between 1 and ${choices.length}${colors.reset}`);
	}
}

async function promptForConfig() {
	const config = {
		shared: {},
		production: {},
		preview: {},
		development: {},
	};

	console.log(`\n${colors.bold}Configuring Shared Environment Variables:${colors.reset}`);
	console.log(`${colors.cyan}(These apply to all environments)${colors.reset}\n`);

	// Prompt for shared variables
	for (const [varName, varConfig] of Object.entries(SHARED_VAR_CONFIG)) {
		console.log(`${colors.cyan}${varName}${colors.reset}${varConfig.required ? " (required)" : ""}`);
		if (varConfig.description) {
			console.log(`  ${varConfig.description}`);
		}

		let value;
		while (true) {
			value = await prompt("  Enter value", varConfig.default || "");
			if (!value && varConfig.required) {
				console.log(`${colors.yellow}  This field is required${colors.reset}`);
				continue;
			}
			if (value && varConfig.validate) {
				const error = varConfig.validate(value);
				if (error) {
					console.log(`${colors.yellow}  ${error}${colors.reset}`);
					continue;
				}
			}
			break;
		}
		config.shared[varName] = value || varConfig.default;
		console.log();
	}

	console.log(`\n${colors.bold}Configuring Per-Environment Variables:${colors.reset}\n`);

	// Prompt for per-environment variables
	for (const [varName, varConfig] of Object.entries(PER_ENV_VAR_CONFIG)) {
		console.log(`${colors.cyan}${varName}${colors.reset}${varConfig.required ? " (required)" : ""}`);
		if (varConfig.description) {
			console.log(`  ${varConfig.description}`);
		}

		for (const env of ENVIRONMENTS) {
			const defaultVal = varConfig.defaults?.[env] || "";
			const value = await prompt(`  ${env}`, defaultVal);
			config[env][varName] = value || defaultVal;
		}
		console.log();
	}

	return config;
}

// ============================================================================
// Vercel CLI Operations
// ============================================================================

function runCommand(command, options = {}) {
	const { silent = false, allowFailure = false } = options;

	try {
		const result = execSync(command, {
			cwd: rootDir,
			encoding: "utf-8",
			stdio: silent ? "pipe" : ["pipe", "pipe", "pipe"],
		});
		return { success: true, output: result.trim() };
	} catch (error) {
		if (allowFailure) {
			return { success: false, output: error.message };
		}
		throw error;
	}
}

function checkVercelCLI() {
	process.stdout.write("Checking Vercel CLI... ");

	const versionResult = runCommand("vercel --version", { silent: true, allowFailure: true });
	if (!versionResult.success) {
		console.log(`${colors.red}NOT FOUND${colors.reset}`);
		console.log(`\n${colors.yellow}Vercel CLI is not installed. Install it with:${colors.reset}`);
		console.log("  npm i -g vercel");
		process.exit(1);
	}
	console.log(`${colors.green}OK${colors.reset} (${versionResult.output})`);

	process.stdout.write("Checking login status... ");
	const whoamiResult = runCommand("vercel whoami", { silent: true, allowFailure: true });
	if (!whoamiResult.success) {
		console.log(`${colors.red}NOT LOGGED IN${colors.reset}`);
		console.log(`\n${colors.yellow}Please log in to Vercel:${colors.reset}`);
		console.log("  vercel login");
		process.exit(1);
	}
	console.log(`${colors.green}OK${colors.reset} (${whoamiResult.output})`);
}

function isProjectLinked() {
	return existsSync(projectJsonPath);
}

function getProjectInfo() {
	if (!isProjectLinked()) {
		return null;
	}
	try {
		const data = JSON.parse(readFileSync(projectJsonPath, "utf-8"));
		return data;
	} catch {
		return null;
	}
}

async function ensureProjectLinked(hasConfigFile) {
	console.log(`\n${colors.bold}Project Status:${colors.reset}`);

	if (isProjectLinked()) {
		const info = getProjectInfo();
		console.log(`  Already linked to: ${colors.green}${info?.projectId || "unknown"}${colors.reset}`);
		return;
	}

	if (hasConfigFile) {
		console.log(`  ${colors.red}Not linked to a Vercel project${colors.reset}`);
		console.log(`\n${colors.yellow}When using env.json, the project must be linked first.${colors.reset}`);
		console.log("Run one of the following:");
		console.log("  vercel link                    # Interactive");
		console.log("  vercel link --yes              # Auto-confirm");
		console.log("  vercel link --yes --token=...  # With token (CI)");
		process.exit(1);
	}

	console.log(`  ${colors.yellow}Not linked to a Vercel project${colors.reset}`);

	await promptChoice("What would you like to do?", ["Create new project and link", "Link to existing project"]);

	console.log();
	process.stdout.write("  Linking... ");

	closeReadline();
	const result = spawnSync("vercel", ["link"], {
		cwd: rootDir,
		stdio: "inherit",
	});
	if (result.status !== 0) {
		console.log(`${colors.red}FAILED${colors.reset}`);
		process.exit(1);
	}

	if (isProjectLinked()) {
		const info = getProjectInfo();
		console.log(`  ${colors.green}OK${colors.reset} (${info?.projectId || "linked"})`);
	}
}

function setEnvVar(name, value, environment) {
	const command = `echo "${value.replace(/"/g, '\\"')}" | vercel env add ${name} ${environment} --force`;
	const result = runCommand(command, { silent: true, allowFailure: true });
	return result.success;
}

async function configureEnvVars(config) {
	console.log(`\n${colors.bold}Setting Environment Variables:${colors.reset}\n`);

	let successCount = 0;
	let failCount = 0;

	// Set shared variables (same value for all environments)
	if (Object.keys(config.shared).length > 0) {
		console.log(`${colors.cyan}shared (setting for all environments):${colors.reset}`);

		for (const [varName, value] of Object.entries(config.shared)) {
			if (!value) {
				continue;
			}

			process.stdout.write(`  ${varName}... `);

			// Set for each environment
			let allSuccess = true;
			for (const env of ENVIRONMENTS) {
				const success = await setEnvVar(varName, value, env);
				if (!success) {
					allSuccess = false;
				}
			}

			if (allSuccess) {
				console.log(`${colors.green}OK${colors.reset}`);
				successCount++;
			} else {
				console.log(`${colors.red}FAILED${colors.reset}`);
				failCount++;
			}
		}
		console.log();
	}

	// Set per-environment variables
	for (const env of ENVIRONMENTS) {
		const envConfig = config[env];
		console.log(`${colors.cyan}${env}:${colors.reset}`);

		for (const [varName, value] of Object.entries(envConfig)) {
			if (!value) {
				continue;
			}

			process.stdout.write(`  ${varName}... `);

			const success = await setEnvVar(varName, value, env);
			if (success) {
				console.log(`${colors.green}OK${colors.reset}`);
				successCount++;
			} else {
				console.log(`${colors.red}FAILED${colors.reset}`);
				failCount++;
			}
		}
		console.log();
	}

	return { successCount, failCount };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
	console.log(`\n${colors.bold}Jolli Vercel Project Initialization${colors.reset}`);
	console.log("====================================\n");

	const args = parseArgs();

	if (args.help) {
		showHelp();
		process.exit(0);
	}

	// Check Vercel CLI
	await checkVercelCLI();

	// Try to load config from env.json, otherwise prompt interactively
	let config = loadConfigFromFile();
	const hasConfigFile = config !== null;

	if (hasConfigFile) {
		const errors = validateConfig(config);
		if (errors.length > 0) {
			console.log(`\n${colors.red}Configuration errors in env.json:${colors.reset}`);
			for (const error of errors) {
				console.log(`  - ${error}`);
			}
			process.exit(1);
		}
	}

	// Ensure project is linked
	await ensureProjectLinked(hasConfigFile);

	// Get config interactively if no config file
	if (!hasConfigFile) {
		config = await promptForConfig();
		saveConfig(config);
	}

	// Set environment variables
	const { successCount, failCount } = await configureEnvVars(config);

	// Summary
	console.log(`${colors.bold}Summary${colors.reset}`);
	console.log("=======");
	console.log(`  Variables set: ${colors.green}${successCount}${colors.reset}`);
	if (failCount > 0) {
		console.log(`  Variables failed: ${colors.red}${failCount}${colors.reset}`);
	}

	console.log(`\n${colors.green}Your Vercel project is ready for deployment!${colors.reset}`);
	console.log("Run: vercel --prod\n");

	closeReadline();
}

main().catch(error => {
	console.error(`\n${colors.red}Error: ${error.message}${colors.reset}`);
	closeReadline();
	process.exit(1);
});
