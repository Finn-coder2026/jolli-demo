import type { ConvoDao } from "../dao/ConvoDao";
import { mockConvoDao } from "../dao/ConvoDao.mock";
import type { DaoProvider } from "../dao/DaoProvider";
import type { TokenUtil } from "../util/TokenUtil";
import { createConvoRouter } from "./ConvoRouter";
import cookieParser from "cookie-parser";
import express from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

describe("ConvoRouter", () => {
	let mockConversation: ConvoDao;
	let mockTokenUtil: TokenUtil<UserInfo>;
	let app: express.Application;

	const mockUserInfo: UserInfo = {
		userId: 1,
		email: "test@example.com",
		name: "Test User",
		picture: undefined,
	};

	beforeEach(() => {
		// Disable logging during tests
		process.env.DISABLE_LOGGING = "true";

		vi.clearAllMocks();

		mockConversation = mockConvoDao();
		mockTokenUtil = {
			encodePayload: vi.fn(),
			decodePayload: vi.fn(),
		} as unknown as TokenUtil<UserInfo>;

		const router = createConvoRouter(mockDaoProvider(mockConversation), mockTokenUtil);
		app = express();
		app.use(express.json());
		app.use(cookieParser());
		app.use("/api/convos", router);
	});

	describe("POST /api/convos", () => {
		it("should create a new convo for authenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app)
				.post("/api/convos")
				.send({
					title: "Test Conversation",
					messages: [{ role: "user", content: "Hello" }],
				});

			expect(response.status).toBe(201);
			expect(response.body).toHaveProperty("id");
			expect(response.body.title).toBe("Test Conversation");
		});

		it("should prefer orgUser.id over tokenUtil userId when available", async () => {
			// This tests the req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId fallback
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Spy on the existing mockConversation.createConvo
			const createConvoSpy = vi.spyOn(mockConversation, "createConvo");

			// Create app with orgUser middleware using the SAME mockConversation
			const routerWithOrgUser = createConvoRouter(mockDaoProvider(mockConversation), mockTokenUtil);
			const appWithOrgUser = express();
			appWithOrgUser.use(express.json());
			appWithOrgUser.use(cookieParser());
			// Inject orgUser with different ID than token
			appWithOrgUser.use((req, _res, next) => {
				req.orgUser = { id: 999, email: "org@example.com", name: "Org User", picture: undefined };
				next();
			});
			appWithOrgUser.use("/api/convos", routerWithOrgUser);

			const response = await request(appWithOrgUser).post("/api/convos").send({
				title: "Org User Conversation",
				messages: [],
			});

			expect(response.status).toBe(201);
			// The conversation should be created with orgUser.id (999) not tokenUtil userId (1)
			expect(createConvoSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 999,
				}),
			);
		});

		it("should create a new convo for visitor", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).post("/api/convos").set("Cookie", ["visitorId=visitor123"]).send({
				title: "Visitor Conversation",
				messages: [],
			});

			expect(response.status).toBe(201);
			expect(response.body).toHaveProperty("id");
			expect(response.body.title).toBe("Visitor Conversation");
		});

		it("should auto-generate title from first user message", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app)
				.post("/api/convos")
				.send({
					messages: [{ role: "user", content: "What is the weather like today?" }],
				});

			expect(response.status).toBe(201);
			expect(response.body.title).toBe("What is the weather like today?");
		});

		it("should truncate auto-generated title to 50 chars", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const longMessage = "a".repeat(100);

			const response = await request(app)
				.post("/api/convos")
				.send({
					messages: [{ role: "user", content: longMessage }],
				});

			expect(response.status).toBe(201);
			expect(response.body.title).toBe(`${"a".repeat(50)}...`);
		});

		it("should use 'New Conversation' title when no title or messages provided", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/convos").send({});

			expect(response.status).toBe(201);
			expect(response.body.title).toBe("New Conversation");
		});

		it("should return 401 when no userId or visitorId", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).post("/api/convos").send({
				title: "Test",
			});

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("Unauthorized");
		});

		it("should handle errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			vi.spyOn(mockConversation, "createConvo").mockRejectedValue(new Error("Database error"));

			const response = await request(app).post("/api/convos").send({
				title: "Test",
			});

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to create convo");
		});
	});

	describe("GET /api/convos", () => {
		it("should list conversations for authenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).get("/api/convos");

			expect(response.status).toBe(200);
			expect(Array.isArray(response.body)).toBe(true);
		});

		it("should list conversations for visitor", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).get("/api/convos").set("Cookie", ["visitorId=visitor123"]);

			expect(response.status).toBe(200);
			expect(Array.isArray(response.body)).toBe(true);
		});

		it("should return 401 when no userId or visitorId", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).get("/api/convos");

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("Unauthorized");
		});

		it("should handle errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			vi.spyOn(mockConversation, "listConvos").mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/api/convos");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to list convos");
		});
	});

	describe("GET /api/convos/:id", () => {
		it("should get specific convo for authenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// First create a conversation
			await request(app).post("/api/convos").send({
				title: "Test Conversation",
			});

			const response = await request(app).get("/api/convos/1");

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty("id");
		});

		it("should get specific convo for visitor", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			// First create a conversation
			await request(app).post("/api/convos").set("Cookie", ["visitorId=visitor123"]).send({
				title: "Visitor Conversation",
			});

			const response = await request(app).get("/api/convos/1").set("Cookie", ["visitorId=visitor123"]);

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty("id");
		});

		it("should return 401 when no userId or visitorId", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).get("/api/convos/1");

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("Unauthorized");
		});

		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).get("/api/convos/invalid");

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid convo ID");
		});

		it("should return 404 when convo not found", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).get("/api/convos/999");

			expect(response.status).toBe(404);
			expect(response.body.error).toBe("Convo not found");
		});

		it("should handle errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			vi.spyOn(mockConversation, "getConvo").mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/api/convos/1");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to get convo");
		});
	});

	describe("PATCH /api/convos/:id", () => {
		it("should update convo title", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// First create a conversation
			await request(app).post("/api/convos").send({
				title: "Old Title",
			});

			const response = await request(app).patch("/api/convos/1").send({
				title: "New Title",
			});

			expect(response.status).toBe(200);
			expect(response.body.title).toBe("New Title");
		});

		it("should update convo messages", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// First create a conversation
			await request(app).post("/api/convos").send({
				title: "Test",
			});

			const newMessages = [
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Hi there!" },
			];

			const response = await request(app).patch("/api/convos/1").send({
				messages: newMessages,
			});

			expect(response.status).toBe(200);
			expect(response.body.messages).toEqual(newMessages);
		});

		it("should return 401 when no userId or visitorId", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).patch("/api/convos/1").send({
				title: "New Title",
			});

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("Unauthorized");
		});

		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).patch("/api/convos/invalid").send({
				title: "New Title",
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid convo ID");
		});

		it("should return 400 when no title or messages provided", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).patch("/api/convos/1").send({});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Must provide title or messages");
		});

		it("should return 400 for invalid messages format (not array)", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).patch("/api/convos/1").send({
				messages: "not an array",
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid messages format");
		});

		it("should return 400 for invalid message role", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app)
				.patch("/api/convos/1")
				.send({
					messages: [{ role: "system", content: "Test" }],
				});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid messages format");
		});

		it("should return 400 for message with non-string content", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// First create a conversation
			await request(app).post("/api/convos").send({
				title: "Test",
			});
			const response = await request(app)
				.patch("/api/convos/1")
				.send({
					messages: [{ role: "user", content: 123 }],
				});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid messages format");
		});

		it("should return 404 when convo not found", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).patch("/api/convos/999").send({
				title: "New Title",
			});

			expect(response.status).toBe(404);
			expect(response.body.error).toBe("Convo not found");
		});

		it("should handle errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			vi.spyOn(mockConversation, "updateConvo").mockRejectedValue(new Error("Database error"));

			const response = await request(app).patch("/api/convos/1").send({
				title: "New Title",
			});

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to update convo");
		});
	});

	describe("DELETE /api/convos/:id", () => {
		it("should delete convo for authenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// First create a conversation
			const createResponse = await request(app).post("/api/convos").send({
				title: "Test",
			});

			const response = await request(app).delete(`/api/convos/${createResponse.body.id}`);

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});

		it("should delete convo for visitor", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			// First create a conversation
			const createResponse = await request(app).post("/api/convos").set("Cookie", ["visitorId=visitor123"]).send({
				title: "Test",
			});

			const response = await request(app)
				.delete(`/api/convos/${createResponse.body.id}`)
				.set("Cookie", ["visitorId=visitor123"]);

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});

		it("should return 401 when no userId or visitorId", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).delete("/api/convos/1");

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("Unauthorized");
		});

		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).delete("/api/convos/invalid");

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid convo ID");
		});

		it("should return 404 when convo not found", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).delete("/api/convos/999");

			expect(response.status).toBe(404);
			expect(response.body.error).toBe("Convo not found");
		});

		it("should handle errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			vi.spyOn(mockConversation, "deleteConvo").mockRejectedValue(new Error("Database error"));

			const response = await request(app).delete("/api/convos/1");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to delete convo");
		});
	});

	describe("POST /api/convos/:id/messages", () => {
		it("should add message to conversation", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// First create a conversation
			await request(app).post("/api/convos").send({
				title: "Test",
			});

			const response = await request(app).post("/api/convos/1/messages").send({
				role: "user",
				content: "Hello!",
			});

			expect(response.status).toBe(200);
			expect(response.body.messages).toContainEqual({
				role: "user",
				content: "Hello!",
			});
		});

		it("should add assistant message to conversation", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// First create a conversation
			await request(app).post("/api/convos").send({
				title: "Test",
			});

			const response = await request(app).post("/api/convos/1/messages").send({
				role: "assistant",
				content: "Hi there!",
			});

			expect(response.status).toBe(200);
			expect(response.body.messages).toContainEqual({
				role: "assistant",
				content: "Hi there!",
			});
		});

		it("should return 401 when no userId or visitorId", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).post("/api/convos/1/messages").send({
				role: "user",
				content: "Hello",
			});

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("Unauthorized");
		});

		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/convos/invalid/messages").send({
				role: "user",
				content: "Hello",
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid convo ID");
		});

		it("should return 400 when role is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/convos/1/messages").send({
				content: "Hello",
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Message must have role and content");
		});

		it("should return 400 when content is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/convos/1/messages").send({
				role: "user",
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Message must have role and content");
		});

		it("should return 400 for invalid message role", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/convos/1/messages").send({
				role: "system",
				content: "Test",
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid message role");
		});

		it("should return 404 when convo not found", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/convos/999/messages").send({
				role: "user",
				content: "Hello",
			});

			expect(response.status).toBe(404);
			expect(response.body.error).toBe("Convo not found");
		});

		it("should handle errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			vi.spyOn(mockConversation, "addMessage").mockRejectedValue(new Error("Database error"));

			const response = await request(app).post("/api/convos/1/messages").send({
				role: "user",
				content: "Hello",
			});

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to add message");
		});
	});
});
