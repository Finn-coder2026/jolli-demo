/**
 * Token Generation Script for E2E Testing
 *
 * This script generates a long-lived JWT token for e2e tests,
 * bypassing the need for Google OAuth authentication.
 *
 * Usage:
 *   npm run e2e:token --workspaces=false
 *
 * The generated token will be shown in the console output.
 * Copy it to e2e/.env.e2e as E2E_TEST_TOKEN
 *
 * Requirements:
 *   1. Configure e2e/.env.e2e with your user info (E2E_USER_ID, E2E_USER_EMAIL, E2E_USER_NAME)
 *   2. TOKEN_SECRET must match backend/.env (default: 'dev')
 *   3. userId must be a valid user ID in your test database
 *      (Login once via Google to create a user, then query: SELECT id, email, name FROM users)
 */

import { config } from "dotenv";
import jwt, { type Algorithm } from "jsonwebtoken";

// Load environment variables from e2e/.env.e2e
config({ path: "./e2e/.env.e2e" });

// Configuration
const secret = process.env.TOKEN_SECRET || "dev";
const expiresIn = "365d";
const algorithm: Algorithm = "HS256";

// User info from environment variables
const userId = process.env.E2E_USER_ID ? Number.parseInt(process.env.E2E_USER_ID, 10) : undefined;
const orgId = process.env.E2E_ORG_ID;
const tenantId = process.env.E2E_TENANT_ID;
const userEmail = process.env.E2E_USER_EMAIL;
const userName = process.env.E2E_USER_NAME;

if (!userId || !userEmail || !userName) {
	console.error("\n\x1b[31mError: Missing required environment variables in e2e/.env.e2e\x1b[0m\n");
	console.error("Please set the following variables:");
	console.error("  E2E_USER_ID=<your user ID from database>");
	console.error("  E2E_ORG_ID=<your org ID from database>");
	console.error("  E2E_TENANT_ID=<your tenant ID from database>");
	console.error("  E2E_USER_EMAIL=<your email>");
	console.error("  E2E_USER_NAME=<your name>");
	console.error("\nTo find your user ID, query the database:");
	console.error("  SELECT id, email, name FROM users;\n");
	process.exit(1);
}

const payload = {
	name: userName,
	email: userEmail,
	picture: undefined,
	userId: userId,
	orgId: orgId,
	tenantId: tenantId,
};

function generateToken(): string {
	return jwt.sign(payload, secret, { algorithm, expiresIn });
}

// Generate and output the token
const token = generateToken();

console.log("\n=== E2E Test Token Generated ===\n");
console.log("Add this to e2e/.env.e2e:\n");
console.log(`E2E_TEST_TOKEN=${token}`);
console.log("\n================================\n");
console.log("Token payload:", payload);
console.log("Expires in:", expiresIn);
console.log("Algorithm:", algorithm);
console.log("\nNote: Ensure userId matches an existing user in your database.");
console.log("Query: SELECT id, email, name FROM users;");
