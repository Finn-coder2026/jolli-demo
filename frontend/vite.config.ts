import path from "node:path";
import { preact } from "@preact/preset-vite";
import type { SnapshotManager } from "@vitest/snapshot/manager";
import { loadEnv } from "vite";
import { intlayer } from "vite-intlayer";
import { defineConfig } from "vitest/config";
import type { Vitest } from "vitest/node";
import type { Reporter } from "vitest/reporters";

// Load env from the frontend directory (where this config file lives)
const devEnv = loadEnv("development", __dirname);

// Build allowedHosts: when VITE_GATEWAY_DOMAIN is set, allow all hosts
// Check both loadEnv result and process.env (for shell-set variables)
const gatewayDomain = devEnv.VITE_GATEWAY_DOMAIN || process.env.VITE_GATEWAY_DOMAIN;

const chunks = {
	// Authentication client
	"better-auth": ["/better-auth/", "/@better-auth/", "/@better-fetch/", "/defu/", "/nanostores/"],

	// Date utilities
	"date-fns": ["/date-fns/", "/@date-fns/", "/react-day-picker/"],

	diff2html: ["/diff2html/", "/diff/", "/@profoundlogic/"],

	// Drag and drop
	"dnd-kit": ["/@dnd-kit/"],

	// Intlayer i18n — split into sub-chunks for cacheability (more specific patterns first)
	"intlayer-runtime": ["/react-intlayer/", "/intlayer/"],
	"intlayer-core": ["/@intlayer/core/"],
	"intlayer-config": ["/@intlayer/config/"],
	"intlayer-editor": ["/@intlayer/editor"],
	"intlayer-dicts": ["/@intlayer/dictionaries-entry/", "/@intlayer/unmerged-dictionaries-entry/"],
	"intlayer-other": ["/@intlayer/"],
	lucide: ["/lucide-preact/"],
	cmdk: ["/cmdk/"],
	"markdown-to-jsx": ["/markdown-to-jsx/", "/highlight.js/"],
	pino: ["/pino/", "/quick-format-unescaped/", "/dateformat/"],
	preact: ["/preact/"],
	radixui: ["/@radix-ui/"],
	"react-select": [
		"/@floating-ui/",
		"/aria-hidden/",
		"/detect-node-es/",
		"/get-nonce/",
		"/react-remove-scroll",
		"/react-style-singleton/",
		"/use-callback-ref/",
		"/use-sidecar/",
	],
	"react-resizable-panels": ["/react-resizable-panels/"],
	sonner: ["/sonner/"],
	tailwind: ["/tailwindcss/", "/tailwind-merge/", "/tailwind-variants/", "/clsx/", "/class-variance-authority/"],

	// TipTap heavy extensions — separated for visibility and caching
	"tiptap-drag-handle": [
		"/@tiptap/extension-drag-handle",
		"/@tiptap/extension-node-range",
		"/@tiptap/extension-collaboration",
		"/@tiptap/y-tiptap",
	],

	// TipTap + ProseMirror editor ecosystem (catches remaining @tiptap packages)
	tiptap: [
		"/@tiptap/",
		"/prosemirror-",
		"/lowlight/",
		"/linkifyjs/",
		"/orderedmap/",
		"/rope-sequence/",
		"/w3c-keyname/",
		"/devlop/",
		"/marked/",
	],

	yaml: ["/yaml/"],

	// Yjs collaboration (transitive deps of tiptap collaboration extensions)
	yjs: ["/yjs/", "/y-protocols/", "/lib0/"],
};

export default defineConfig({
	base: "/",
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"lucide-react": "lucide-preact",
		},
	},
	build: {
		minify: "esbuild",
		modulePreload: false,
		rollupOptions: {
			external: ["pino-roll", "pino-pretty"],
			output: {
				manualChunks: id => {
					if (!id.includes("/node_modules/")) {
						return;
					}

					for (const chunk in chunks) {
						if (chunks[chunk as keyof typeof chunks].some(name => id.includes(name))) {
							return chunk;
						}
					}
					// biome-ignore lint/suspicious/noConsole: for debug purposes
					console.log(`id being grouped in "other": ${id}`);
					return "other";
				},
			},
			treeshake: {
				moduleSideEffects: false,
				propertyReadSideEffects: false,
				tryCatchDeoptimization: false,
				unknownGlobalSideEffects: false,
			},
		},
		target: "es2022",
	},
	envPrefix: ["NODE_", "VITE_"],
	plugins: [
		preact(),
		// Only load intlayer plugin when not running tests
		// In test mode, we pre-build dictionaries with `npm run build:intlayer`
		...(process.env.VITEST ? [] : [intlayer()]),
	],
	appType: "spa",
	server: {
		open: process.env.NODE_ENV === "development",
		host: devEnv.VITE_HOST ?? true,
		port: devEnv.VITE_PORT ? Number.parseInt(devEnv.VITE_PORT, 10) : 8034,
		proxy: {
			"/api": "http://localhost:7034",
			"/connect": {
				target: "http://localhost:7034",
				// Preserve original host header for OAuth redirect_uri detection
				headers: {
					"X-Forwarded-Host": "preserve",
				},
				configure: proxy => {
					proxy.on("proxyReq", (proxyReq, req) => {
						// Forward the original host to the backend
						// Use X-Forwarded-Host from nginx if available, otherwise fall back to Host header
						const forwardedHost = req.headers["x-forwarded-host"];
						const originalHost = typeof forwardedHost === "string" ? forwardedHost : req.headers.host;
						if (originalHost) {
							proxyReq.setHeader("X-Forwarded-Host", originalHost);
						}
					});
				},
			},
			"/auth": {
				target: "http://localhost:7034",
				// Preserve original host header for multi-tenant routing
				headers: {
					"X-Forwarded-Host": "preserve",
				},
				configure: proxy => {
					proxy.on("proxyReq", (proxyReq, req) => {
						// Forward the original host to the backend
						// Use X-Forwarded-Host from nginx if available, otherwise fall back to Host header
						const forwardedHost = req.headers["x-forwarded-host"];
						const originalHost = typeof forwardedHost === "string" ? forwardedHost : req.headers.host;
						if (originalHost) {
							proxyReq.setHeader("X-Forwarded-Host", originalHost);
						}
					});
				},
			},
		},
		// When VITE_GATEWAY_DOMAIN is set, allow all hosts for HTTPS gateway support
		allowedHosts: gatewayDomain ? true : ["localhost"],
	},
	preview: {
		port: devEnv.VITE_PORT ? Number.parseInt(devEnv.VITE_PORT, 10) : 8034,
	},
	test: {
		coverage: {
			all: true,
			exclude: [
				"**/*.mock.ts",
				"**/*.content.ts",
				"**/*.d.ts",
				"src/Main.tsx",
				"**/types/**",
				"src/test/TestUtils.tsx",
				"src/test/IntlayerMock.ts",
				"src/ui/auth/AcceptOwnerInvitationPage.tsx", // Page component - tested via E2E
				"src/ui/sites/CreateSiteWizard.tsx",
				"src/ui/sites/SiteDetail.tsx",
				"src/ui/sites/RepositoryViewer.tsx",
				"src/ui/Sites.tsx",
				"src/ui/onboarding/OnboardingFsmLog.tsx", // FSM log display - tested via E2E
			],
			include: ["src/**"],
			reporter: ["html", "json", "lcov", "text"],
			thresholds: {
				branches: 97,
				functions: 96,
				lines: 97,
				statements: 97,
			},
		},
		css: {
			include: /.*/,
			modules: {
				classNameStrategy: "non-scoped",
			},
		},
		env: {
			LOG_TRANSPORTS: "console",
			DISABLE_LOGGING: "false",
		},
		environment: "jsdom",
		globals: true,
		globalSetup: ["./vitest.globalSetup.ts"],
		pool: "forks",
		reporters: ["default", errorIfObsoleteSnapshot()],
		resolveSnapshotPath: (path: string, extension: string) => path + extension,
		restoreMocks: true,
		setupFiles: ["./src/util/Vitest.tsx"],
	},
});

function errorIfObsoleteSnapshot(): Reporter {
	let snapshot: SnapshotManager;

	function onInit(vitest: Vitest) {
		snapshot = vitest.snapshot;
	}

	function onTestRunEnd() {
		if (snapshot.options.updateSnapshot !== "all" && snapshot.summary.unchecked) {
			throw new Error(
				`Obsolete snapshots found: ${JSON.stringify(snapshot.summary.uncheckedKeysByFile, null, 2)}`,
			);
		}
	}

	return { onInit, onTestRunEnd };
}
