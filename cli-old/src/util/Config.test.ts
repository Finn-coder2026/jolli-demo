import { clearAuthToken, loadActiveConvoId, loadAuthToken, saveActiveConvoId, saveAuthToken } from "./Config";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the fs/promises module
vi.mock("node:fs/promises", async () => {
	const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
	return {
		...actual,
		mkdir: vi.fn(),
		readFile: vi.fn(),
		writeFile: vi.fn(),
		unlink: vi.fn(),
	};
});

// Mock os module
vi.mock("node:os", async () => {
	const actual = await vi.importActual<typeof import("node:os")>("node:os");
	return {
		...actual,
		homedir: vi.fn(() => "/mock/home"),
	};
});

describe("Config", () => {
	let mockMkdir: ReturnType<typeof vi.fn>;
	let mockReadFile: ReturnType<typeof vi.fn>;
	let mockWriteFile: ReturnType<typeof vi.fn>;
	let mockUnlink: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const fsPromises = await import("node:fs/promises");
		mockMkdir = vi.mocked(fsPromises.mkdir);
		mockReadFile = vi.mocked(fsPromises.readFile);
		mockWriteFile = vi.mocked(fsPromises.writeFile);
		mockUnlink = vi.mocked(fsPromises.unlink);

		// Reset mocks
		mockMkdir.mockClear();
		mockReadFile.mockClear();
		mockWriteFile.mockClear();
		mockUnlink.mockClear();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("saveAuthToken", () => {
		it("should create config directory and save token", async () => {
			const token = "test-token-123";

			await saveAuthToken(token);

			expect(mockMkdir).toHaveBeenCalledWith(join("/mock/home", ".jolli"), { recursive: true });
			expect(mockWriteFile).toHaveBeenCalledWith(
				join("/mock/home", ".jolli", "config.json"),
				JSON.stringify({ authToken: token }, undefined, 2),
				"utf-8",
			);
		});

		it("should handle mkdir errors by propagating them", async () => {
			const error = new Error("Permission denied");
			mockMkdir.mockRejectedValue(error);

			await expect(saveAuthToken("test-token")).rejects.toThrow("Permission denied");
		});

		it("should handle writeFile errors by propagating them", async () => {
			const error = new Error("Disk full");
			mockWriteFile.mockRejectedValue(error);

			await expect(saveAuthToken("test-token")).rejects.toThrow("Disk full");
		});
	});

	describe("loadAuthToken", () => {
		it("should load auth token from config file", async () => {
			const token = "test-token-456";
			const configContent = JSON.stringify({ authToken: token });
			mockReadFile.mockResolvedValue(configContent);

			const result = await loadAuthToken();

			expect(mockReadFile).toHaveBeenCalledWith(join("/mock/home", ".jolli", "config.json"), "utf-8");
			expect(result).toBe(token);
		});

		it("should return undefined if config file does not exist", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT: no such file or directory"));

			const result = await loadAuthToken();

			expect(result).toBeUndefined();
		});

		it("should return undefined if config file is invalid JSON", async () => {
			mockReadFile.mockResolvedValue("invalid json");

			const result = await loadAuthToken();

			expect(result).toBeUndefined();
		});

		it("should return undefined if config file has no authToken", async () => {
			mockReadFile.mockResolvedValue(JSON.stringify({}));

			const result = await loadAuthToken();

			expect(result).toBeUndefined();
		});
	});

	describe("clearAuthToken", () => {
		it("should delete config file", async () => {
			mockUnlink.mockResolvedValue(undefined);

			await clearAuthToken();

			expect(mockUnlink).toHaveBeenCalledWith(join("/mock/home", ".jolli", "config.json"));
		});

		it("should handle errors silently when file does not exist", async () => {
			mockUnlink.mockRejectedValue(new Error("ENOENT: no such file or directory"));

			await expect(clearAuthToken()).resolves.toBeUndefined();
		});

		it("should handle other errors silently", async () => {
			mockUnlink.mockRejectedValue(new Error("Permission denied"));

			await expect(clearAuthToken()).resolves.toBeUndefined();
		});
	});

	describe("saveActiveConvoId", () => {
		it("should save convo ID and preserve auth token", async () => {
			const token = "existing-token";
			const ConvoId = 42;
			mockReadFile.mockResolvedValue(JSON.stringify({ authToken: token }));

			await saveActiveConvoId(ConvoId);

			expect(mockMkdir).toHaveBeenCalledWith(join("/mock/home", ".jolli"), { recursive: true });
			expect(mockReadFile).toHaveBeenCalledWith(join("/mock/home", ".jolli", "config.json"), "utf-8");
			expect(mockWriteFile).toHaveBeenCalledWith(
				join("/mock/home", ".jolli", "config.json"),
				JSON.stringify({ authToken: token, activeConvoId: ConvoId }, undefined, 2),
				"utf-8",
			);
		});

		it("should save convo ID when auth token does not exist", async () => {
			const ConvoId = 42;
			mockReadFile.mockRejectedValue(new Error("ENOENT: no such file or directory"));

			await saveActiveConvoId(ConvoId);

			expect(mockWriteFile).toHaveBeenCalledWith(
				join("/mock/home", ".jolli", "config.json"),
				JSON.stringify({ activeConvoId: ConvoId }, undefined, 2),
				"utf-8",
			);
		});

		it("should save undefined convo ID to clear it", async () => {
			const token = "existing-token";
			mockReadFile.mockResolvedValue(JSON.stringify({ authToken: token, activeConvoId: 42 }));

			await saveActiveConvoId(undefined);

			expect(mockWriteFile).toHaveBeenCalledWith(
				join("/mock/home", ".jolli", "config.json"),
				JSON.stringify({ authToken: token }, undefined, 2),
				"utf-8",
			);
		});

		it("should save empty config when both auth token and convo ID are undefined", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT: no such file or directory"));

			await saveActiveConvoId(undefined);

			expect(mockWriteFile).toHaveBeenCalledWith(
				join("/mock/home", ".jolli", "config.json"),
				JSON.stringify({}, undefined, 2),
				"utf-8",
			);
		});

		it("should handle mkdir errors by propagating them", async () => {
			const error = new Error("Permission denied");
			mockMkdir.mockRejectedValue(error);

			await expect(saveActiveConvoId(42)).rejects.toThrow("Permission denied");
		});

		it("should handle writeFile errors by propagating them", async () => {
			const error = new Error("Disk full");
			mockReadFile.mockResolvedValue(JSON.stringify({ authToken: "test" }));
			mockWriteFile.mockRejectedValue(error);

			await expect(saveActiveConvoId(42)).rejects.toThrow("Disk full");
		});
	});

	describe("loadActiveConvoId", () => {
		it("should load convo ID from config file", async () => {
			const ConvoId = 42;
			const configContent = JSON.stringify({ activeConvoId: ConvoId });
			mockReadFile.mockResolvedValue(configContent);

			const result = await loadActiveConvoId();

			expect(mockReadFile).toHaveBeenCalledWith(join("/mock/home", ".jolli", "config.json"), "utf-8");
			expect(result).toBe(ConvoId);
		});

		it("should return undefined if config file does not exist", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT: no such file or directory"));

			const result = await loadActiveConvoId();

			expect(result).toBeUndefined();
		});

		it("should return undefined if config file is invalid JSON", async () => {
			mockReadFile.mockResolvedValue("invalid json");

			const result = await loadActiveConvoId();

			expect(result).toBeUndefined();
		});

		it("should return undefined if config file has no activeConvoId", async () => {
			mockReadFile.mockResolvedValue(JSON.stringify({ authToken: "test-token" }));

			const result = await loadActiveConvoId();

			expect(result).toBeUndefined();
		});
	});
});
