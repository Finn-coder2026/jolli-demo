/**
 * ECS App Entry Point
 *
 * This is the main entry point for running the Jolli backend on AWS ECS.
 * It creates and starts the Express server with all routes and middleware,
 * serving both the API and frontend static files as a long-lived process.
 *
 * Environment variables:
 * - NODE_ENV: Should be "production"
 * - PORT: Server port (default: 8034)
 * - HOST: Server host (default: 0.0.0.0)
 * - PSTORE_ENV: Parameter Store environment (dev, preview, prod)
 * - PSTORE_PATH_BASE: Parameter Store path base (app or backend)
 * - MULTI_TENANT_ENABLED: Enable multi-tenant mode
 */

import { createAndStartServer } from "./AppFactory";

await createAndStartServer();
