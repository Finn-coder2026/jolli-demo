import { registerSourceCommands } from "./source";
import { Command } from "commander";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireProjectRoot: vi.fn(),
	assertValidSourceName: vi.fn(),
	normalizeSourceName: vi.fn(),
	normalizeSourcePath: vi.fn(),
	setSource: vi.fn(),
	removeSource: vi.fn(),
	loadAuthToken: vi.fn(),
	loadSpace: vi.fn(),
	createClient: vi.fn(),
}));

vi.mock("../../shared/config", () => ({
	getConfig: vi.fn(() => ({ JOLLI_URL: "https://example.test" })),
}));

vi.mock("../../shared/ProjectRoot", () => ({
	requireProjectRoot: mocks.requireProjectRoot,
}));

vi.mock("../../shared/Sources", () => ({
	assertValidSourceName: mocks.assertValidSourceName,
	getSourcePathStatus: vi.fn(),
	loadSources: vi.fn(),
	normalizeSourceName: mocks.normalizeSourceName,
	normalizeSourcePath: mocks.normalizeSourcePath,
	removeSource: mocks.removeSource,
	setSource: mocks.setSource,
}));

vi.mock("../auth/config", () => ({
	loadAuthToken: mocks.loadAuthToken,
	loadSpace: mocks.loadSpace,
}));

vi.mock("jolli-common", () => ({
	createClient: mocks.createClient,
}));

async function runCommand(args: Array<string>): Promise<void> {
	const program = new Command();
	registerSourceCommands(program);
	await program.parseAsync(args, { from: "user" });
}

describe("source command local-only behavior", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mocks.requireProjectRoot.mockResolvedValue("/project");
		mocks.normalizeSourceName.mockImplementation((name: string) => name.trim().toLowerCase());
		mocks.normalizeSourcePath.mockImplementation(
			async (input: string) => `/resolved/${input.replace(/^\.\/+/, "")}`,
		);
		mocks.setSource.mockResolvedValue(undefined);
		mocks.removeSource.mockResolvedValue({
			removed: true,
			config: { version: 1, sources: {} },
		});
		mocks.loadAuthToken.mockResolvedValue("token");
		mocks.loadSpace.mockResolvedValue("space");
		mocks.createClient.mockReturnValue({
			spaces: () => ({ getSpaceBySlug: vi.fn() }),
			sources: () => ({
				listSources: vi.fn(),
				createSource: vi.fn(),
				listSpaceSources: vi.fn(),
				bindSource: vi.fn(),
				unbindSource: vi.fn(),
			}),
		});
	});

	test("source add --local-only never calls server APIs", async () => {
		await runCommand(["source", "add", "backend", "--path", "./backend", "--local-only"]);

		expect(mocks.loadAuthToken).not.toHaveBeenCalled();
		expect(mocks.loadSpace).not.toHaveBeenCalled();
		expect(mocks.createClient).not.toHaveBeenCalled();
		expect(mocks.setSource).toHaveBeenCalledWith("/project", "backend", {
			type: "git",
			path: "/resolved/backend",
		});
	});

	test("source remove --local-only never calls server APIs", async () => {
		await runCommand(["source", "remove", "backend", "--local-only"]);

		expect(mocks.loadAuthToken).not.toHaveBeenCalled();
		expect(mocks.loadSpace).not.toHaveBeenCalled();
		expect(mocks.createClient).not.toHaveBeenCalled();
		expect(mocks.removeSource).toHaveBeenCalledWith("/project", "backend");
	});
});
