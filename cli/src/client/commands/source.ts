import { getConfig } from "../../shared/config";
import { requireProjectRoot } from "../../shared/ProjectRoot";
import {
	assertValidSourceName,
	getSourcePathStatus,
	type LocalSourceEntry,
	loadSources,
	normalizeSourceName,
	normalizeSourcePath,
	removeSource as removeLocalSource,
	setSource,
} from "../../shared/Sources";
import { loadAuthToken, loadSpace } from "../auth/config";
import type { Command } from "commander";
import { type Client, createClient, type Source } from "jolli-common";

const config = getConfig();

interface SourceAddOptions {
	path: string;
	localOnly: boolean;
}

interface SourceRemoveOptions {
	localOnly: boolean;
}

interface SourceListOptions {
	json: boolean;
}

interface ServerContext {
	readonly client: Client;
	readonly spaceId: number;
	readonly spaceSlug: string;
}

interface BoundSource extends Source {
	readonly binding: {
		readonly spaceId: number;
		readonly sourceId: number;
		readonly enabled: boolean;
	};
}

interface SourceListRow {
	readonly name: string;
	readonly localPath: string | null;
	readonly localStatus: "resolved" | "missing-path" | "invalid-git-root" | "not-configured";
	readonly server: "bound" | "local-only" | "unknown";
	readonly serverSourceId?: number;
}

async function getServerContext(projectRoot: string, requireServer: boolean): Promise<ServerContext | undefined> {
	const authToken = await loadAuthToken();
	if (!authToken) {
		if (requireServer) {
			throw new Error("Not authenticated. Run `jolli auth login` first (or pass --local-only).");
		}
		return;
	}

	const spaceSlug = await loadSpace(projectRoot);
	if (!spaceSlug) {
		if (requireServer) {
			throw new Error("No active space selected. Run `jolli auth space` first (or pass --local-only).");
		}
		return;
	}

	const client = createClient(config.JOLLI_URL, authToken);
	const space = await client.spaces().getSpaceBySlug(spaceSlug);
	if (!space) {
		if (requireServer) {
			throw new Error(
				`Active space "${spaceSlug}" was not found on the server. Re-run \`jolli auth space\` (or pass --local-only).`,
			);
		}
		return;
	}

	return { client, spaceId: space.id, spaceSlug };
}

async function ensureSourceBoundByName(name: string, context: ServerContext): Promise<number> {
	const normalizedName = normalizeSourceName(name);

	let source = (await context.client.sources().listSources()).find(s => s.name === normalizedName);
	if (!source) {
		try {
			source = await context.client.sources().createSource({
				name: normalizedName,
				type: "git",
			});
		} catch {
			// Handle races/conflicts by re-reading list.
			source = (await context.client.sources().listSources()).find(s => s.name === normalizedName);
			if (!source) {
				throw new Error(`Failed to create source "${normalizedName}" on server.`);
			}
		}
	}

	const boundSources = (await context.client.sources().listSpaceSources(context.spaceId)) as Array<BoundSource>;
	const alreadyBound = boundSources.some(s => s.id === source.id);
	if (!alreadyBound) {
		await context.client.sources().bindSource(context.spaceId, { sourceId: source.id });
	}

	return source.id;
}

async function unbindSourceByName(name: string, context: ServerContext): Promise<boolean> {
	const normalizedName = normalizeSourceName(name);
	const boundSources = (await context.client.sources().listSpaceSources(context.spaceId)) as Array<BoundSource>;
	const bound = boundSources.find(s => s.name === normalizedName);
	if (!bound) {
		return false;
	}
	await context.client.sources().unbindSource(context.spaceId, bound.id);
	return true;
}

function formatServerLabel(row: SourceListRow): string {
	if (row.server === "local-only") {
		return "local-only";
	}
	if (row.server === "unknown") {
		return "unknown";
	}
	return row.serverSourceId ? `bound(id:${row.serverSourceId})` : "bound";
}

function printSourceRows(rows: Array<SourceListRow>): void {
	if (rows.length === 0) {
		console.log("No sources configured.");
		return;
	}

	console.log("NAME\tLOCAL PATH\tLOCAL STATUS\tSERVER");
	for (const row of rows) {
		const localPath = row.localPath ?? "(not configured locally)";
		console.log(`${row.name}\t${localPath}\t${row.localStatus}\t${formatServerLabel(row)}`);
	}
}

async function buildSourceRows(projectRoot: string): Promise<Array<SourceListRow>> {
	const [local, serverContext] = await Promise.all([
		loadSources(projectRoot),
		getServerContext(projectRoot, false),
	]);
	const hasServerContext = !!serverContext;
	const serverSources = serverContext
		? ((await serverContext.client.sources().listSpaceSources(serverContext.spaceId)) as Array<BoundSource>)
		: [];

	const names = new Set([...Object.keys(local.sources), ...serverSources.map(s => s.name)]);
	const rows: Array<SourceListRow> = [];
	for (const name of Array.from(names).sort((a, b) => a.localeCompare(b))) {
		const localEntry = local.sources[name];
		const serverEntry = serverSources.find(s => s.name === name);
		const localStatus = localEntry ? await getSourcePathStatus(localEntry.path) : "not-configured";
		rows.push({
			name,
			localPath: localEntry?.path ?? null,
			localStatus,
			server: hasServerContext ? (serverEntry ? "bound" : "local-only") : "unknown",
			serverSourceId: localEntry?.sourceId ?? serverEntry?.id,
		});
	}
	return rows;
}

async function runSourceAdd(name: string, options: SourceAddOptions): Promise<void> {
	const projectRoot = await requireProjectRoot();
	const normalizedName = normalizeSourceName(name);
	assertValidSourceName(normalizedName);
	const normalizedPath = await normalizeSourcePath(options.path);
	const context = options.localOnly ? undefined : await getServerContext(projectRoot, true);

	let serverSourceId: number | undefined;
	if (context) {
		serverSourceId = await ensureSourceBoundByName(normalizedName, context);
	}

	const sourceEntry: LocalSourceEntry = serverSourceId
		? { type: "git", path: normalizedPath, sourceId: serverSourceId }
		: { type: "git", path: normalizedPath };
	await setSource(projectRoot, normalizedName, sourceEntry);

	console.log(`Added source "${normalizedName}" at ${normalizedPath}`);
	if (context && serverSourceId) {
		console.log(`Synced source metadata to space "${context.spaceSlug}" (sourceId=${serverSourceId}).`);
	} else {
		console.log("Saved locally only.");
	}
}

async function runSourceRemove(name: string, options: SourceRemoveOptions): Promise<void> {
	const projectRoot = await requireProjectRoot();
	const normalizedName = normalizeSourceName(name);
	assertValidSourceName(normalizedName);
	const context = options.localOnly ? undefined : await getServerContext(projectRoot, true);

	if (context) {
		const unbound = await unbindSourceByName(normalizedName, context);
		if (unbound) {
			console.log(`Unbound source "${normalizedName}" from space "${context.spaceSlug}".`);
		}
	}

	const removed = await removeLocalSource(projectRoot, normalizedName);
	if (!removed.removed) {
		console.log(`Source "${normalizedName}" was not in local config.`);
		return;
	}
	console.log(`Removed source "${normalizedName}" from local config.`);
}

async function runSourceList(options: SourceListOptions): Promise<void> {
	const projectRoot = await requireProjectRoot();
	const rows = await buildSourceRows(projectRoot);
	if (options.json) {
		console.log(JSON.stringify(rows, null, 2));
		return;
	}
	printSourceRows(rows);
	if (rows.some(row => row.server === "unknown")) {
		console.log("Note: server binding status is unknown (not authenticated and/or no active space selected).");
	}
}

/**
 * Registers source management commands.
 */
export function registerSourceCommands(program: Command): void {
	const sourceCommand = program.command("source").description("Manage source repositories for impact analysis");

	sourceCommand
		.command("add <name>")
		.description("Add a source mapping (and bind server metadata by default)")
		.requiredOption("--path <path>", "Local path to a git repository (absolute or relative)")
		.option("--local-only", "Skip server metadata sync and only update .jolli/sources.json", false)
		.action(async (name: string, options: SourceAddOptions) => {
			try {
				await runSourceAdd(name, options);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		});

	sourceCommand
		.command("remove <name>")
		.description("Remove a source mapping (and unbind server metadata by default)")
		.option("--local-only", "Skip server unbind and only update .jolli/sources.json", false)
		.action(async (name: string, options: SourceRemoveOptions) => {
			try {
				await runSourceRemove(name, options);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		});

	sourceCommand
		.command("list")
		.description("List sources from local config merged with server bindings")
		.option("-j, --json", "Output as JSON", false)
		.action(async (options: SourceListOptions) => {
			try {
				await runSourceList(options);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		});
}
