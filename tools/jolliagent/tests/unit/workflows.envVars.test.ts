import { afterEach, describe, expect, it, vi } from "vitest";

const { commandRunMock, chatTurnMock } = vi.hoisted(() => ({
	commandRunMock: vi.fn().mockResolvedValue({
		stdout: "ok",
		stderr: "",
		exitCode: 0,
	}),
	chatTurnMock: vi.fn().mockImplementation(({ onTextDelta }: { onTextDelta?: (delta: string) => void }) => {
		if (onTextDelta) {
			onTextDelta("impact analysis complete");
		}
	}),
}));

vi.mock("e2b", () => ({
	Sandbox: {
		create: vi.fn().mockResolvedValue({
			sandboxId: "sandbox_test_123",
			commands: {
				run: commandRunMock,
			},
			kill: vi.fn().mockResolvedValue(undefined),
		}),
	},
}));

vi.mock("src/agents/factory", () => ({
	createAgent: vi.fn().mockReturnValue({
		agent: {
			chatTurn: chatTurnMock,
		},
		withDefaults: (opts: unknown) => opts,
	}),
}));

import { runWorkflow } from "src/workflows";

describe("workflow env vars", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("passes JOLLI and GitHub env vars to shell run steps", async () => {
		const result = await runWorkflow(
			"run-jolliscript",
			{
				e2bApiKey: "test-e2b-key",
				e2bTemplateId: "test-template-id",
				anthropicApiKey: "test-anthropic-key",
				githubToken: "gh_token_123",
				syncServerUrl: "https://public.jolli.example/api",
				jolliAuthToken: "sandbox-auth-token",
				jolliSpace: "space-slug",
				debug: false,
			},
			{
				jobSteps: [
					{
						name: "Run CLI",
						run: "jolli sync",
					},
				],
				killSandbox: true,
			},
		);

		expect(result.success).toBe(true);
		expect(commandRunMock).toHaveBeenCalledWith(
			expect.stringContaining("bash -lc"),
			expect.objectContaining({
				envs: expect.objectContaining({
					GH_PAT: "gh_token_123",
					GITHUB_TOKEN: "gh_token_123",
					SYNC_SERVER_URL: "https://public.jolli.example/api",
					JOLLI_AUTH_TOKEN: "sandbox-auth-token",
					JOLLI_SPACE: "space-slug",
				}),
			}),
		);
	});

	it("builds cli-impact workflow steps and passes env vars to clone/sync/impact commands", async () => {
		const result = await runWorkflow(
			"cli-impact",
			{
				e2bApiKey: "test-e2b-key",
				e2bTemplateId: "test-template-id",
				anthropicApiKey: "test-anthropic-key",
				githubToken: "gh_token_impact",
				syncServerUrl: "https://public.jolli.example/api",
				jolliAuthToken: "sandbox-auth-token",
				jolliSpace: "impact-space",
				debug: false,
			},
			{
				githubOrg: "impact-org",
				githubRepo: "impact-repo",
				githubBranch: "feature/impact",
				eventJrn: "jrn::path:/home/global/sources/github/impact-org/impact-repo/feature/impact",
				killSandbox: true,
			},
		);

		expect(result.success).toBe(true);
		expect(chatTurnMock).toHaveBeenCalledTimes(1);

		const cloneCall = commandRunMock.mock.calls.find(([command]) =>
			String(command).includes('gh repo clone "$REPO" "$WORKSPACE_DIR" -- --branch "$BRANCH" --no-single-branch'),
		);
		expect(cloneCall).toBeDefined();
		expect(cloneCall?.[1]).toEqual(
			expect.objectContaining({
				envs: expect.objectContaining({
					REPO: "impact-org/impact-repo",
					BRANCH: "feature/impact",
					GH_PAT: "gh_token_impact",
				}),
			}),
		);

		const impactCall = commandRunMock.mock.calls.find(([command]) =>
			String(command).includes("jolli impact extract"),
		);
		expect(impactCall).toBeDefined();
		expect(String(impactCall?.[0])).toContain("cd ~/workspace/$GH_REPO/$GH_BRANCH && jolli impact extract");
		expect(impactCall?.[1]).toEqual(
			expect.objectContaining({
				envs: expect.objectContaining({
					GH_PAT: "gh_token_impact",
					GH_TOKEN: "gh_token_impact",
					GITHUB_TOKEN: "gh_token_impact",
					GH_ORG: "impact-org",
					GH_REPO: "impact-repo",
					GH_BRANCH: "feature/impact",
					SYNC_SERVER_URL: "https://public.jolli.example/api",
					JOLLI_AUTH_TOKEN: "sandbox-auth-token",
					JOLLI_SPACE: "impact-space",
				}),
			}),
		);

		const syncCalls = commandRunMock.mock.calls.filter(([command]) => String(command).includes("jolli sync"));
		expect(syncCalls.length).toBeGreaterThanOrEqual(2);
		expect(syncCalls.some(([command]) => String(command).includes("jolli sync down"))).toBe(true);
		expect(syncCalls.some(([command]) => String(command).includes("jolli sync up"))).toBe(true);

		const pushCall = syncCalls.find(([command]) => String(command).includes("jolli sync up"));
		expect(pushCall).toBeDefined();
		expect(String(pushCall?.[0])).toContain("/tmp/changeset-metadata.json");
		expect(String(pushCall?.[0])).toContain("--merge-prompt");
	});
});
