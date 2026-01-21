import { runCommand, runCommandWithStreaming } from "./BuildRunner";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process spawn
vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
}));

// Mock the Logger
vi.mock("./Logger", () => ({
	getLog: () => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));

// Import spawn after mocking
import { spawn } from "node:child_process";

interface MockProcess extends EventEmitter {
	stdout: EventEmitter;
	stderr: EventEmitter;
	kill: ReturnType<typeof vi.fn>;
}

function createMockProcess(): MockProcess {
	const proc = new EventEmitter() as MockProcess;
	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();
	proc.kill = vi.fn();
	return proc;
}

describe("BuildRunner", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("runCommand", () => {
		it("should run a command and capture stdout", async () => {
			const mockProc = createMockProcess();
			vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

			const resultPromise = runCommand("echo", ["hello"], { cwd: "/tmp" });

			// Simulate stdout data
			mockProc.stdout.emit("data", Buffer.from("hello world\n"));

			// Simulate close
			mockProc.emit("close", 0);

			const result = await resultPromise;
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toBe("hello world\n");
			expect(result.stderr).toBe("");
		});

		it("should run a command and capture stderr", async () => {
			const mockProc = createMockProcess();
			vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

			const resultPromise = runCommand("failing-cmd", [], { cwd: "/tmp" });

			// Simulate stderr data
			mockProc.stderr.emit("data", Buffer.from("error occurred\n"));

			// Simulate close with non-zero exit
			mockProc.emit("close", 1);

			const result = await resultPromise;
			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toBe("error occurred\n");
		});

		it("should handle command timeout", async () => {
			const mockProc = createMockProcess();
			vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

			const resultPromise = runCommand("slow-cmd", [], { cwd: "/tmp", timeout: 5000 });

			// Simulate some output before timeout
			mockProc.stdout.emit("data", Buffer.from("started\n"));

			// Advance timers past timeout
			vi.advanceTimersByTime(6000);

			// Simulate process closing after kill
			mockProc.emit("close", null);

			const result = await resultPromise;
			expect(result.exitCode).toBe(124); // Timeout exit code
			expect(result.stderr).toContain("Command timed out");
			expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");
		});

		it("should handle spawn error", async () => {
			const mockProc = createMockProcess();
			vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

			const resultPromise = runCommand("nonexistent-cmd", [], { cwd: "/tmp" });

			// Simulate spawn error
			mockProc.emit("error", new Error("ENOENT: command not found"));

			const result = await resultPromise;
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Failed to start command: ENOENT: command not found");
		});

		it("should pass custom environment variables", async () => {
			const mockProc = createMockProcess();
			vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

			const resultPromise = runCommand("echo", ["$FOO"], { cwd: "/tmp", env: { FOO: "bar" } });

			mockProc.emit("close", 0);

			await resultPromise;

			expect(spawn).toHaveBeenCalledWith(
				"echo",
				["$FOO"],
				expect.objectContaining({
					env: expect.objectContaining({ FOO: "bar" }),
				}),
			);
		});

		it("should use exit code 1 when close code is null (not timeout)", async () => {
			const mockProc = createMockProcess();
			vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

			const resultPromise = runCommand("killed-cmd", [], { cwd: "/tmp" });

			// Simulate process being killed externally (code is null, but not due to timeout)
			mockProc.emit("close", null);

			const result = await resultPromise;
			expect(result.exitCode).toBe(1); // Defaults to 1 when code is null
			expect(result.stderr).toBe(""); // No timeout message since timedOut is false
		});
	});

	describe("runCommandWithStreaming", () => {
		it("should stream stdout to callback", async () => {
			const mockProc = createMockProcess();
			vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

			const stdoutChunks: Array<string> = [];
			const resultPromise = runCommandWithStreaming(
				"npm",
				["install"],
				{ cwd: "/tmp", timeout: 60000 },
				chunk => stdoutChunks.push(chunk),
				undefined,
			);

			// Simulate stdout data in chunks
			mockProc.stdout.emit("data", Buffer.from("Installing...\n"));
			mockProc.stdout.emit("data", Buffer.from("Resolving dependencies...\n"));

			mockProc.emit("close", 0);

			const result = await resultPromise;

			expect(stdoutChunks).toEqual(["Installing...\n", "Resolving dependencies...\n"]);
			expect(result.stdout).toBe("Installing...\nResolving dependencies...\n");
			expect(result.exitCode).toBe(0);
		});

		it("should stream stderr to callback", async () => {
			const mockProc = createMockProcess();
			vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

			const stderrChunks: Array<string> = [];
			const resultPromise = runCommandWithStreaming(
				"npm",
				["install"],
				{ cwd: "/tmp", timeout: 60000 },
				undefined,
				chunk => stderrChunks.push(chunk),
			);

			// Simulate stderr data
			mockProc.stderr.emit("data", Buffer.from("npm warn deprecated\n"));
			mockProc.stderr.emit("data", Buffer.from("npm warn peer dependency\n"));

			mockProc.emit("close", 0);

			const result = await resultPromise;

			expect(stderrChunks).toEqual(["npm warn deprecated\n", "npm warn peer dependency\n"]);
			expect(result.stderr).toBe("npm warn deprecated\nnpm warn peer dependency\n");
		});

		it("should work without callbacks", async () => {
			const mockProc = createMockProcess();
			vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

			const resultPromise = runCommandWithStreaming("npm", ["install"], { cwd: "/tmp", timeout: 60000 });

			mockProc.stdout.emit("data", Buffer.from("output\n"));
			mockProc.emit("close", 0);

			const result = await resultPromise;

			expect(result.stdout).toBe("output\n");
			expect(result.exitCode).toBe(0);
		});

		it("should handle timeout with streaming", async () => {
			const mockProc = createMockProcess();
			vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

			const stdoutChunks: Array<string> = [];
			const resultPromise = runCommandWithStreaming(
				"npm",
				["run", "build"],
				{ cwd: "/tmp", timeout: 5000 },
				chunk => stdoutChunks.push(chunk),
			);

			// Simulate some output
			mockProc.stdout.emit("data", Buffer.from("Building...\n"));

			// Advance past timeout
			vi.advanceTimersByTime(6000);

			// Simulate close after kill
			mockProc.emit("close", null);

			const result = await resultPromise;

			expect(stdoutChunks).toEqual(["Building...\n"]);
			expect(result.exitCode).toBe(124);
			expect(result.stderr).toContain("Command timed out");
			expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");
		});

		it("should stream both stdout and stderr simultaneously", async () => {
			const mockProc = createMockProcess();
			vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

			const stdoutChunks: Array<string> = [];
			const stderrChunks: Array<string> = [];
			const resultPromise = runCommandWithStreaming(
				"npm",
				["run", "build"],
				{ cwd: "/tmp", timeout: 60000 },
				chunk => stdoutChunks.push(chunk),
				chunk => stderrChunks.push(chunk),
			);

			// Interleaved stdout and stderr
			mockProc.stdout.emit("data", Buffer.from("Compiling...\n"));
			mockProc.stderr.emit("data", Buffer.from("Warning: deprecated API\n"));
			mockProc.stdout.emit("data", Buffer.from("Done.\n"));

			mockProc.emit("close", 0);

			const result = await resultPromise;

			expect(stdoutChunks).toEqual(["Compiling...\n", "Done.\n"]);
			expect(stderrChunks).toEqual(["Warning: deprecated API\n"]);
			expect(result.stdout).toBe("Compiling...\nDone.\n");
			expect(result.stderr).toBe("Warning: deprecated API\n");
		});

		it("should handle spawn error with streaming", async () => {
			const mockProc = createMockProcess();
			vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

			const resultPromise = runCommandWithStreaming("nonexistent", [], { cwd: "/tmp", timeout: 60000 });

			mockProc.emit("error", new Error("ENOENT"));

			const result = await resultPromise;

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Failed to start command: ENOENT");
		});

		it("should use exit code 1 when close code is null (not timeout) with streaming", async () => {
			const mockProc = createMockProcess();
			vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

			const resultPromise = runCommandWithStreaming("killed-cmd", [], { cwd: "/tmp", timeout: 60000 });

			// Simulate process being killed externally (code is null, but not due to timeout)
			mockProc.emit("close", null);

			const result = await resultPromise;
			expect(result.exitCode).toBe(1); // Defaults to 1 when code is null
			expect(result.stderr).toBe(""); // No timeout message since timedOut is false
		});
	});
});
