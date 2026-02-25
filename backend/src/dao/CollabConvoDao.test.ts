import type { Database } from "../core/Database";
import type { ArtifactType, CollabConvo } from "../model/CollabConvo";
import { mockCollabConvo, mockCollabMessage, mockNewCollabConvo } from "../model/CollabConvo.mock";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { type CollabConvoDao, createCollabConvoDao, createCollabConvoDaoProvider } from "./CollabConvoDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("CollabConvoDao", () => {
	let mockCollabConvos: ModelDef<CollabConvo>;
	let collabConvoDao: CollabConvoDao;

	beforeEach(() => {
		mockCollabConvos = {
			create: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<CollabConvo>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockCollabConvos),
			where: vi.fn().mockReturnValue({}),
			fn: vi.fn().mockReturnValue("mock-fn"),
			col: vi.fn().mockReturnValue("mock-col"),
		} as unknown as Sequelize;

		collabConvoDao = createCollabConvoDao(mockSequelize);
	});

	describe("createCollabConvo", () => {
		it("should create a collab convo", async () => {
			const newConvo = mockNewCollabConvo({
				artifactType: "doc_draft",
				artifactId: 1,
				messages: [],
			});

			const createdConvo = mockCollabConvo({
				...newConvo,
				id: 1,
			});

			vi.mocked(mockCollabConvos.create).mockResolvedValue(createdConvo as never);

			const result = await collabConvoDao.createCollabConvo(newConvo);

			expect(mockCollabConvos.create).toHaveBeenCalledWith(newConvo);
			expect(result).toEqual(createdConvo);
		});

		it("should strip null bytes from convo payload before create", async () => {
			const newConvo = mockNewCollabConvo({
				artifactType: "cli_workspace\u0000" as ArtifactType,
				artifactId: 1,
				messages: [mockCollabMessage({ role: "assistant", content: "Hello\u0000world" })],
				metadata: {
					workspaceRoot: "/Users/phu/docs-vault\u0000",
					sources: [{ name: "example-express-js", path: "/Users/phu/work/example\u0000-express" }],
				},
			});

			const createdConvo = mockCollabConvo({
				...newConvo,
				id: 1,
				artifactType: "cli_workspace",
				messages: [mockCollabMessage({ role: "assistant", content: "Helloworld" })],
				metadata: {
					workspaceRoot: "/Users/phu/docs-vault",
					sources: [{ name: "example-express-js", path: "/Users/phu/work/example-express" }],
				},
			});

			vi.mocked(mockCollabConvos.create).mockResolvedValue(createdConvo as never);

			await collabConvoDao.createCollabConvo(newConvo);

			expect(mockCollabConvos.create).toHaveBeenCalledWith({
				...newConvo,
				artifactType: "cli_workspace",
				messages: [mockCollabMessage({ role: "assistant", content: "Helloworld" })],
				metadata: {
					workspaceRoot: "/Users/phu/docs-vault",
					sources: [{ name: "example-express-js", path: "/Users/phu/work/example-express" }],
				},
			});
		});
	});

	describe("getCollabConvo", () => {
		it("should return a convo by ID", async () => {
			const convo = mockCollabConvo({ id: 1 });
			const mockGet = vi.fn().mockReturnValue(convo);

			vi.mocked(mockCollabConvos.findOne).mockResolvedValue({
				get: mockGet,
			} as never);

			const result = await collabConvoDao.getCollabConvo(1);

			expect(mockCollabConvos.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
			expect(mockGet).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(convo);
		});

		it("should return undefined if convo not found", async () => {
			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.getCollabConvo(999);

			expect(result).toBeUndefined();
		});
	});

	describe("findByArtifact", () => {
		it("should find convo by artifact type and ID", async () => {
			const convo = mockCollabConvo({ artifactType: "doc_draft", artifactId: 5 });
			const mockGet = vi.fn().mockReturnValue(convo);

			vi.mocked(mockCollabConvos.findOne).mockResolvedValue({
				get: mockGet,
			} as never);

			const result = await collabConvoDao.findByArtifact("doc_draft", 5);

			expect(mockCollabConvos.findOne).toHaveBeenCalledWith({
				where: { artifactType: "doc_draft", artifactId: 5 },
			});
			expect(result).toEqual(convo);
		});

		it("should return undefined if convo not found", async () => {
			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.findByArtifact("doc_draft", 999);

			expect(result).toBeUndefined();
		});
	});

	describe("listByArtifactType", () => {
		it("should list convos by artifact type with default pagination", async () => {
			const convos = [
				mockCollabConvo({ id: 1, artifactType: "doc_draft" }),
				mockCollabConvo({ id: 2, artifactType: "doc_draft" }),
			];

			vi.mocked(mockCollabConvos.findAll).mockResolvedValue(convos.map(c => ({ get: () => c })) as never);

			const result = await collabConvoDao.listByArtifactType("doc_draft");

			expect(mockCollabConvos.findAll).toHaveBeenCalledWith({
				where: { artifactType: "doc_draft" },
				order: [["updatedAt", "DESC"]],
				limit: 50,
				offset: 0,
			});
			expect(result).toEqual(convos);
		});

		it("should respect limit and offset parameters", async () => {
			vi.mocked(mockCollabConvos.findAll).mockResolvedValue([] as never);

			await collabConvoDao.listByArtifactType("cli_workspace", 10, 5);

			expect(mockCollabConvos.findAll).toHaveBeenCalledWith({
				where: { artifactType: "cli_workspace" },
				order: [["updatedAt", "DESC"]],
				limit: 10,
				offset: 5,
			});
		});

		it("should return empty array when no convos found", async () => {
			vi.mocked(mockCollabConvos.findAll).mockResolvedValue([] as never);

			const result = await collabConvoDao.listByArtifactType("doc_draft");

			expect(result).toEqual([]);
		});
	});

	describe("addMessage", () => {
		it("should add a message to a convo", async () => {
			const message = mockCollabMessage({ content: "Hello" });
			const convo = mockCollabConvo({ id: 1, messages: [] });
			const updatedConvo = mockCollabConvo({
				id: 1,
				messages: [message],
			});

			vi.mocked(mockCollabConvos.findOne).mockResolvedValueOnce({
				get: () => convo,
			} as never);

			vi.mocked(mockCollabConvos.update).mockResolvedValue([1] as never);

			vi.mocked(mockCollabConvos.findOne).mockResolvedValueOnce({
				get: () => updatedConvo,
			} as never);

			const result = await collabConvoDao.addMessage(1, message);

			expect(mockCollabConvos.update).toHaveBeenCalledWith({ messages: [message] }, { where: { id: 1 } });
			expect(result).toEqual(updatedConvo);
		});

		it("should return undefined if convo not found", async () => {
			const message = mockCollabMessage();

			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.addMessage(999, message);

			expect(result).toBeUndefined();
			expect(mockCollabConvos.update).not.toHaveBeenCalled();
		});
	});

	describe("addMessages", () => {
		it("should append messages in a single update", async () => {
			const message1 = mockCollabMessage({ content: "One" });
			const message2 = mockCollabMessage({ content: "Two" });
			const convo = mockCollabConvo({ id: 1, messages: [] });
			const updatedConvo = mockCollabConvo({
				id: 1,
				messages: [message1, message2],
			});

			vi.mocked(mockCollabConvos.findOne).mockResolvedValueOnce({
				get: () => convo,
			} as never);

			vi.mocked(mockCollabConvos.update).mockResolvedValue([1] as never);

			vi.mocked(mockCollabConvos.findOne).mockResolvedValueOnce({
				get: () => updatedConvo,
			} as never);

			const result = await collabConvoDao.addMessages(1, [message1, message2]);

			expect(mockCollabConvos.update).toHaveBeenCalledWith(
				{ messages: [message1, message2] },
				{ where: { id: 1 } },
			);
			expect(result).toEqual(updatedConvo);
		});

		it("should return current convo when no messages provided", async () => {
			const convo = mockCollabConvo({ id: 1, messages: [] });
			vi.mocked(mockCollabConvos.findOne).mockResolvedValue({
				get: () => convo,
			} as never);

			const result = await collabConvoDao.addMessages(1, []);

			expect(mockCollabConvos.update).not.toHaveBeenCalled();
			expect(result).toEqual(convo);
		});

		it("should return undefined if convo not found", async () => {
			const message = mockCollabMessage();
			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.addMessages(999, [message]);

			expect(result).toBeUndefined();
			expect(mockCollabConvos.update).not.toHaveBeenCalled();
		});

		it("should strip null bytes from appended messages", async () => {
			const message = mockCollabMessage({ role: "assistant", content: "A\u0000B" });
			const convo = mockCollabConvo({ id: 1, messages: [] });
			const updatedConvo = mockCollabConvo({
				id: 1,
				messages: [mockCollabMessage({ role: "assistant", content: "AB" })],
			});

			vi.mocked(mockCollabConvos.findOne)
				.mockResolvedValueOnce({ get: () => convo } as never)
				.mockResolvedValueOnce({ get: () => updatedConvo } as never);
			vi.mocked(mockCollabConvos.update).mockResolvedValue([1] as never);

			await collabConvoDao.addMessages(1, [message]);

			expect(mockCollabConvos.update).toHaveBeenCalledWith(
				{ messages: [mockCollabMessage({ role: "assistant", content: "AB" })] },
				{ where: { id: 1 } },
			);
		});
	});

	describe("getMessages", () => {
		it("should return all messages from a convo", async () => {
			const messages = [mockCollabMessage({ content: "Hello" }), mockCollabMessage({ content: "World" })];
			const convo = mockCollabConvo({ id: 1, messages });

			vi.mocked(mockCollabConvos.findOne).mockResolvedValue({
				get: () => convo,
			} as never);

			const result = await collabConvoDao.getMessages(1);

			expect(result).toEqual(messages);
		});

		it("should return empty array if convo not found", async () => {
			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.getMessages(999);

			expect(result).toEqual([]);
		});

		it("should return messages with pagination", async () => {
			const messages = [
				mockCollabMessage({ content: "1" }),
				mockCollabMessage({ content: "2" }),
				mockCollabMessage({ content: "3" }),
				mockCollabMessage({ content: "4" }),
			];
			const convo = mockCollabConvo({ id: 1, messages });

			vi.mocked(mockCollabConvos.findOne).mockResolvedValue({
				get: () => convo,
			} as never);

			const result = await collabConvoDao.getMessages(1, 2, 1);

			expect(result).toHaveLength(2);
			expect(result[0].role).toBe("user");
			if (result[0].role === "user" || result[0].role === "assistant" || result[0].role === "system") {
				expect(result[0].content).toBe("2");
			}
			if (result[1].role === "user" || result[1].role === "assistant" || result[1].role === "system") {
				expect(result[1].content).toBe("3");
			}
		});
	});

	describe("updateLastActivity", () => {
		it("should update the last activity timestamp", async () => {
			const convo = mockCollabConvo({ id: 1 });

			vi.mocked(mockCollabConvos.findOne).mockResolvedValueOnce({
				get: () => convo,
			} as never);

			vi.mocked(mockCollabConvos.update).mockResolvedValue([1] as never);

			vi.mocked(mockCollabConvos.findOne).mockResolvedValueOnce({
				get: () => convo,
			} as never);

			const result = await collabConvoDao.updateLastActivity(1);

			expect(mockCollabConvos.update).toHaveBeenCalled();
			expect(result).toEqual(convo);
		});

		it("should return undefined if convo not found", async () => {
			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.updateLastActivity(999);

			expect(result).toBeUndefined();
		});
	});

	describe("deleteCollabConvo", () => {
		it("should delete a convo", async () => {
			vi.mocked(mockCollabConvos.destroy).mockResolvedValue(1);

			const result = await collabConvoDao.deleteCollabConvo(1);

			expect(mockCollabConvos.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
			expect(result).toBe(true);
		});

		it("should return false if convo not found", async () => {
			vi.mocked(mockCollabConvos.destroy).mockResolvedValue(0);

			const result = await collabConvoDao.deleteCollabConvo(999);

			expect(result).toBe(false);
		});
	});

	describe("deleteAllCollabConvos", () => {
		it("should delete all convos", async () => {
			vi.mocked(mockCollabConvos.destroy).mockResolvedValue(5);

			await collabConvoDao.deleteAllCollabConvos();

			expect(mockCollabConvos.destroy).toHaveBeenCalledWith({ where: {} });
		});
	});

	describe("updateMetadata", () => {
		it("should update metadata on an existing convo", async () => {
			const convo = mockCollabConvo({
				id: 1,
				metadata: { sandboxId: "existing-sandbox-123" },
			});
			const updatedConvo = mockCollabConvo({
				id: 1,
				metadata: { sandboxId: "new-sandbox-456" },
			});

			vi.mocked(mockCollabConvos.findOne)
				.mockResolvedValueOnce({
					get: () => convo,
				} as never)
				.mockResolvedValueOnce({
					get: () => updatedConvo,
				} as never);

			vi.mocked(mockCollabConvos.update).mockResolvedValue([1] as never);

			const result = await collabConvoDao.updateMetadata(1, { sandboxId: "new-sandbox-456" });

			expect(mockCollabConvos.update).toHaveBeenCalledWith(
				{ metadata: { sandboxId: "new-sandbox-456" } },
				{ where: { id: 1 } },
			);
			expect(result).toEqual(updatedConvo);
		});

		it("should return undefined if convo not found", async () => {
			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.updateMetadata(999, { sandboxId: "test" });

			expect(result).toBeUndefined();
			expect(mockCollabConvos.update).not.toHaveBeenCalled();
		});

		it("should strip null bytes from metadata values", async () => {
			const convo = mockCollabConvo({
				id: 1,
				metadata: { sandboxId: "existing-sandbox-123" },
			});
			const updatedConvo = mockCollabConvo({
				id: 1,
				metadata: { sandboxId: "new-sandbox-456", workspaceRoot: "/tmp/docs-vault" },
			});

			vi.mocked(mockCollabConvos.findOne)
				.mockResolvedValueOnce({ get: () => convo } as never)
				.mockResolvedValueOnce({ get: () => updatedConvo } as never);
			vi.mocked(mockCollabConvos.update).mockResolvedValue([1] as never);

			await collabConvoDao.updateMetadata(1, { workspaceRoot: "/tmp/docs-vault\u0000" });

			expect(mockCollabConvos.update).toHaveBeenCalledWith(
				{ metadata: { sandboxId: "existing-sandbox-123", workspaceRoot: "/tmp/docs-vault" } },
				{ where: { id: 1 } },
			);
		});
	});

	describe("updateTitle", () => {
		it("should update the title on an existing convo", async () => {
			const convo = mockCollabConvo({ id: 1, title: "Old Title" });
			const updatedConvo = mockCollabConvo({ id: 1, title: "New Title" });

			vi.mocked(mockCollabConvos.findOne)
				.mockResolvedValueOnce({
					get: () => convo,
				} as never)
				.mockResolvedValueOnce({
					get: () => updatedConvo,
				} as never);

			vi.mocked(mockCollabConvos.update).mockResolvedValue([1] as never);

			const result = await collabConvoDao.updateTitle(1, "New Title");

			expect(mockCollabConvos.update).toHaveBeenCalledWith({ title: "New Title" }, { where: { id: 1 } });
			expect(result).toEqual(updatedConvo);
		});

		it("should return undefined if convo not found", async () => {
			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.updateTitle(999, "New Title");

			expect(result).toBeUndefined();
			expect(mockCollabConvos.update).not.toHaveBeenCalled();
		});

		it("should strip null bytes from title", async () => {
			const convo = mockCollabConvo({ id: 1, title: "Old Title" });
			const updatedConvo = mockCollabConvo({ id: 1, title: "NewTitle" });

			vi.mocked(mockCollabConvos.findOne)
				.mockResolvedValueOnce({ get: () => convo } as never)
				.mockResolvedValueOnce({ get: () => updatedConvo } as never);
			vi.mocked(mockCollabConvos.update).mockResolvedValue([1] as never);

			await collabConvoDao.updateTitle(1, "New\u0000Title");

			expect(mockCollabConvos.update).toHaveBeenCalledWith({ title: "NewTitle" }, { where: { id: 1 } });
		});
	});

	describe("truncateMessages", () => {
		it("should truncate messages to the specified count", async () => {
			const messages = [
				mockCollabMessage({ content: "1" }),
				mockCollabMessage({ content: "2" }),
				mockCollabMessage({ content: "3" }),
			];
			const convo = mockCollabConvo({ id: 1, messages });
			const truncatedConvo = mockCollabConvo({ id: 1, messages: messages.slice(0, 2) });

			vi.mocked(mockCollabConvos.findOne)
				.mockResolvedValueOnce({ get: () => convo } as never)
				.mockResolvedValueOnce({ get: () => truncatedConvo } as never);

			vi.mocked(mockCollabConvos.update).mockResolvedValue([1] as never);

			const result = await collabConvoDao.truncateMessages(1, 2);

			expect(mockCollabConvos.update).toHaveBeenCalledWith(
				{ messages: messages.slice(0, 2) },
				{ where: { id: 1 } },
			);
			expect(result).toEqual(truncatedConvo);
		});

		it("should return undefined if convo not found", async () => {
			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.truncateMessages(999, 2);

			expect(result).toBeUndefined();
			expect(mockCollabConvos.update).not.toHaveBeenCalled();
		});
	});

	describe("findSeededConvo", () => {
		it("should return matching seeded convo", async () => {
			const convo = mockCollabConvo({
				id: 5,
				artifactType: "agent_hub",
				metadata: { convoKind: "getting_started", createdForUserId: 1 },
			});
			const mockGet = vi.fn().mockReturnValue(convo);

			vi.mocked(mockCollabConvos.findOne).mockResolvedValue({
				get: mockGet,
			} as never);

			const result = await collabConvoDao.findSeededConvo("agent_hub", "getting_started", 1);

			expect(mockCollabConvos.findOne).toHaveBeenCalledWith({
				where: expect.objectContaining({
					artifactType: "agent_hub",
				}),
			});
			expect(mockGet).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(convo);
		});

		it("should return undefined when no matching seeded convo exists", async () => {
			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.findSeededConvo("agent_hub", "getting_started", 1);

			expect(result).toBeUndefined();
		});
	});

	describe("createCollabConvoDaoProvider", () => {
		it("returns default DAO when context is undefined", () => {
			const defaultDao = {} as CollabConvoDao;
			const provider = createCollabConvoDaoProvider(defaultDao);

			const result = provider.getDao(undefined);

			expect(result).toBe(defaultDao);
		});

		it("returns tenant DAO when context has database with collabConvoDao", () => {
			const defaultDao = {} as CollabConvoDao;
			const tenantDao = {} as CollabConvoDao;
			const context = {
				database: { collabConvoDao: tenantDao } as Database,
			} as TenantOrgContext;
			const provider = createCollabConvoDaoProvider(defaultDao);

			const result = provider.getDao(context);

			expect(result).toBe(tenantDao);
		});

		it("returns default DAO when context database has no collabConvoDao", () => {
			const defaultDao = {} as CollabConvoDao;
			const context = {
				database: {} as Database,
			} as TenantOrgContext;
			const provider = createCollabConvoDaoProvider(defaultDao);

			const result = provider.getDao(context);

			expect(result).toBe(defaultDao);
		});
	});
});
