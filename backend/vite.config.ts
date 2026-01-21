import { resolve as pathResolve } from "node:path";
import { loadEnv } from "vite";
import { VitePluginNode } from "vite-plugin-node";
import { defineConfig } from "vitest/config";

// Load env from the backend directory (where this config file lives)
// Pass empty string as prefix to load all env variables (not just VITE_*)
const devEnv = loadEnv("development", __dirname, "");

// Build allowedHosts: when USE_GATEWAY is set, allow all hosts
// Check both loadEnv result and process.env (for shell-set variables)
const useGateway = devEnv.USE_GATEWAY === "true" || process.env.USE_GATEWAY === "true";
const defaultAllowedHosts: Array<string> = ["localhost"];

export default defineConfig({
	base: "./",
	build: {
		minify: "esbuild",
		target: "es2022",
	},
	plugins: [
		...VitePluginNode({
			adapter: "express",
			appPath: "./src/Main.ts",
			initAppOnBoot: process.env.NODE_ENV === "development",
			outputFormat: "module",
		}),
	],
	resolve: {
		alias: {
			// Allow local dev to resolve workspace package without a root install
			"jolli-agent/jolliscript": pathResolve(process.cwd(), "../tools/jolliagent/src/jolliscript/index.ts"),
			"jolli-agent/workflows": pathResolve(process.cwd(), "../tools/jolliagent/src/workflows.ts"),
			"jolli-agent": pathResolve(process.cwd(), "../tools/jolliagent/src/index.ts"),
			// Allow local dev to resolve nextra-generator from source
			"nextra-generator": pathResolve(process.cwd(), "../tools/nextra-generator/src/index.ts"),
			// Fix uuid ESM/CJS interop issue in tests
			uuid: pathResolve(process.cwd(), "../node_modules/uuid/dist/index.js"),
			// Force ansi-styles to resolve to the CJS build for Vitest
			"ansi-styles": pathResolve(process.cwd(), "../node_modules/ansi-styles/index.js"),
		},
		conditions: ["node", "import", "require"],
		mainFields: ["main", "module"],
	},
	server: {
		open: false,
		port: 7034,
		// When USE_GATEWAY is set, allow all hosts for HTTPS gateway support
		allowedHosts: useGateway ? true : defaultAllowedHosts,
	},
	test: {
		setupFiles: ["./src/test/setup.ts"],
		//server: {
		//	deps: {
		//			inline: true,
		//		},
		//	},
		coverage: {
			all: true,
			exclude: [
				"**/*.mock.ts",
				"src/Main.ts",
				"src/AppFactory.ts",
				"src/cli/MigrateSchemas.ts", // CLI entry point - just runs SchemaMigration functions
				"src/dao/DaoProvider.ts", // Interface-only file - no executable code
				"src/tenant/TenantDatabaseConfig.ts", // Interface-only file - no executable code
				"src/events/*.ts",
				"src/github/GitHub.ts",
				"src/index.ts",
				"src/jobs/JobTypes.ts",
				"src/schemas/*.ts",
				"src/test/integration/**",
				"src/types/*.ts",
				"src/tenant/TenantSequelizeFactory.ts",
				"src/util/DocGenerationUtil.ts",
				"src/util/ModelDef.ts",
				"src/util/OctokitUtil.ts",
				"src/util/S3.ts",
				"src/util/Sequelize.ts",
				"src/util/SeedDocs.ts",
			],
			include: ["src/**"],
			reporter: ["html", "json", "lcov", "text"],
			thresholds: {
				lines: 97,
				statements: 97,
				branches: 97,
				functions: 97,
			},
		},
		env: {
			LOG_TRANSPORTS: "console",
			DISABLE_LOGGING: "true",
			TOKEN_SECRET: "test-token-secret-for-unit-tests",
			GITHUB_APPS_INFO: JSON.stringify({
				app_id: 12345,
				slug: "test-app",
				client_id: "Iv1.test-client-id",
				client_secret: "test-client-secret",
				webhook_secret: "test-webhook-secret",
				private_key: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC2tE+niyzoQ2ja
mVrYZBzKnB5hN/gI44lKTrdyY71y8ks+XC4fV7sWxy0Q1DtLmoo5j74sYDIGFE0x
2JDmkYEW6wuazDEiUAs0PIftqYsi6lB9WhLOINZ4o6tYOwM2laJR6s6cMCZog3PR
QghocV06PkQPnNdEbhOhBi456+tJ1W2jAxyTVgc71C3YMaa/qhLdiT8ymL7Yy1oL
oHcUGiMF791LleLD36VTENUAW+w7fjLXAMy7101FnyIdnKrudXoOgVGcK0J8cMrs
mgTqVxTodPUcnw1hoqx7GyZKpcG0tQRxiPnsmPXGPh2PfmhSe+hyTzaPdXnSq8Vt
Tata4zwvAgMBAAECggEAHE8pXcyIKMpJH5X40uQFkgn0AHGrp7TvO5RMLcKb7Yjy
ymF+GV0pSrOR8rRFJnHLo8pMrT46ggv4lMCkXcAt6wnVwnvhIRqbTHy/Pb6yJbbT
bJjdpmga00EzoM2EB0Z9it6Bz7GmQeDHEVAp/Vo+F8g4w4ffKGXl+g1QcakcdqlX
uRvWh3TG9bSKktkR1GZYyfZEJ9ZxKsYkL1pdkXnjGy3lNeI7pB4RUYr1bYXGoAGm
xNK4GDnAZeB6CpAfpb0eTrApKRAFUlu1/zJ6Z2DTuHfnM+2sTCcNcW/43ffc+o6W
2f+BJRDx6rhNpwDTrr8cpK7emopux4Z9MRBAHXsAAQKBgQD2uZwVC30pycunevH1
c6ouRQcshPWjUMTB+bochnmPvGiBzB+Og5k0I/nIe5CyjrFPvJ2Iv+qByT6DKuBQ
0WFf+/pz3/LIyWGe+L1QrpCz/RUhKhGDNOklvkmR/BUICpW0gufqfJggNmzoWO2f
uAdsNmbKwZ7PaihkTLEdBa62LwKBgQC9kpcJ3iZ8GwVKewF0/a0BftnrMlhCOS+g
8JeByLvBAhvI2Rb2gtqbi/T9pkJhmLFJqZxaBwnBAgCfegJHi65aUALE5c3k7v/m
+MH5f2QU/NRF71ZocrDQVrLu2KGGYGs+PJYoVKgNmpWz4tbVYx/C3GykCZO92szw
796LB1haAQKBgQCy70YdlSl/JxUGMApPA0XHLNTZGsyzVx57t8ucaIK9Fd2NVScF
yrdPs0+ycLsuZIJ/28E8rkM7QWKO6oeo1VGTtUGczCxeJn8gNjHG0/OqNcAfP01Y
JQV6FBlzQKlYHaUZN19PFnGV2yL9F5Gupl7rwkCmh+nPb6Q/qcdBzx84jQKBgQCW
6berd1oTuj8AB+QlCj1Lz3wTrERuk6/C40T5YJ93CwKrZYbOP2VgJo6lzlFR+IhK
J+f8E1ZEfB+a1TozUpM9+iv6Kyc5dLnrWWSyBiPaQVuLQPj8tTDk6eAQHAyaOO+m
3/x5pssR6Vn7lj2IKh0Ctw8VlzoyDZjQxWPYMcS4AQKBgA0+XNZQ9xrBEtWqpvlA
b8z4GOt2n2W2HI7A7kEs5CZNVHBbFaRKstFNDf7BNPD2P4B1mmYz02hYv1YNnyOT
hnoF5lXcuec68+t5WjjuZ7IXb9gF6MnuiHDSFzfFHb39+l4XrLv8QRCFqge8BBbl
CsPGsHjRQP31pfVTFrZp5ywg
-----END PRIVATE KEY-----`,
				name: "Test App",
				html_url: "https://github.com/apps/test-app",
			}),
		},
		globals: true,
		pool: "threads",
		resolveSnapshotPath: (path: string, extension: string) => path + extension,
		restoreMocks: true,
	},
});
