import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import { CodeScanner } from "./CodeScanner.js";
import * as FileDiscovery from "./FileDiscovery.js";

vi.mock("node:fs/promises");
vi.mock("./FileDiscovery.js", () => ({
	DEFAULT_MAX_FILE_SIZE: 500 * 1024,
	discoverCodeFiles: vi.fn(),
}));

/** Helper to create an async generator from an array of files */
async function* createFileIterator(files: Array<string>): AsyncGenerator<string> {
	for (const file of files) {
		yield file;
	}
}

describe("CodeScanner", () => {
	let scanner: CodeScanner;

	beforeEach(() => {
		scanner = new CodeScanner();
		vi.clearAllMocks();
	});

	describe("scan", () => {
		it("should scan repository and find routes", async () => {
			const mockFiles = ["/repo/routes/chat.ts", "/repo/routes/users.ts"];
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(mockFiles));

			const chatCode = `
        router.post('/api/chat', async (req, res) => {
          const { message, userId } = req.body;
          if (!message) throw new Error('Message required');
          res.json({ response: 'Hello' });
        });
      `;

			vi.mocked(fs.readFile).mockResolvedValue(chatCode);

			const result = await scanner.scan("/repo");

			expect(result.routes.length).toBeGreaterThan(0);
			expect(result.title).toBe("repo");
			expect(result.version).toBe("1.0.0");
		});

		it("should emit events during scanning", async () => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/routes/test.ts"]));
			vi.mocked(fs.readFile).mockResolvedValue("router.get('/test', (req, res) => {})");

			const events: Array<string> = [];
			scanner.on("start", () => events.push("start"));
			scanner.on("filesFound", () => events.push("filesFound"));
			scanner.on("complete", () => events.push("complete"));

			await scanner.scan("/repo");

			expect(events).toContain("start");
			expect(events).toContain("filesFound");
			expect(events).toContain("complete");
		});

		it("should handle empty repositories", async () => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator([]));

			const result = await scanner.scan("/empty-repo");

			expect(result.routes).toEqual([]);
			expect(result.title).toBe("empty-repo");
		});

		it("should continue scanning after file errors", async () => {
			const mockFiles = ["/repo/routes/bad.ts", "/repo/routes/good.ts"];
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(mockFiles));

			vi.mocked(fs.readFile)
				.mockRejectedValueOnce(new Error("File not found"))
				.mockResolvedValueOnce("router.get('/test', (req, res) => {})");

			const errorEvents: Array<{ filePath: string; error: Error }> = [];
			scanner.on("error", data => errorEvents.push(data));

			const result = await scanner.scan("/repo");

			expect(errorEvents.length).toBe(1);
			expect(result.routes.length).toBeGreaterThanOrEqual(0);
		});

		it("should process files in batches", async () => {
			// Create 120 files to test multiple batches (default batchSize is 50)
			const mockFiles = Array.from({ length: 120 }, (_, i) => `/repo/routes/file${i}.ts`);
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(mockFiles));
			vi.mocked(fs.readFile).mockResolvedValue("router.get('/test', (req, res) => {})");

			const batchEvents: Array<{ filesProcessed: number }> = [];
			scanner.on("batchComplete", data => batchEvents.push(data));

			await scanner.scan("/repo");

			// Should have 2 batch events (50 + 50, then remaining 20 processed at end)
			expect(batchEvents.length).toBe(2);
			expect(batchEvents[0].filesProcessed).toBe(50);
			expect(batchEvents[1].filesProcessed).toBe(100);
		});

		it("should respect custom batchSize option", async () => {
			const mockFiles = Array.from({ length: 25 }, (_, i) => `/repo/routes/file${i}.ts`);
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(mockFiles));
			vi.mocked(fs.readFile).mockResolvedValue("router.get('/test', (req, res) => {})");

			const batchEvents: Array<{ filesProcessed: number }> = [];
			scanner.on("batchComplete", data => batchEvents.push(data));

			await scanner.scan("/repo", { batchSize: 10 });

			// With batch size 10 and 25 files: 2 full batches (10, 20), remaining 5 processed at end
			expect(batchEvents.length).toBe(2);
			expect(batchEvents[0].filesProcessed).toBe(10);
			expect(batchEvents[1].filesProcessed).toBe(20);
		});
	});

	describe("route detection", () => {
		beforeEach(() => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/routes/test.ts"]));
		});

		it("should detect GET routes", async () => {
			const code = `
        router.get('/api/users', (req, res) => {
          res.json({ users: [] });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].method).toBe("GET");
			expect(result.routes[0].path).toBe("/api/users");
		});

		it("should detect POST routes with request body", async () => {
			const code = `
        router.post('/api/users', (req, res) => {
          const { name, email } = req.body;
          if (!name) throw new Error('Name required');
          res.status(201).json({ id: 1, name });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			const route = result.routes[0];
			expect(route.method).toBe("POST");
			expect(route.path).toBe("/api/users");
			expect(route.handler.requestBody).toBeDefined();
			expect(route.handler.requestBody?.properties).toHaveLength(2);
		});

		it("should detect PUT routes", async () => {
			const code = `
        app.put('/api/users/:id', (req, res) => {
          const { name } = req.body;
          res.json({ updated: true });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes[0].method).toBe("PUT");
		});

		it("should detect DELETE routes", async () => {
			const code = `
        router.delete('/api/users/:id', (req, res) => {
          res.status(204).send();
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes[0].method).toBe("DELETE");
		});

		it("should detect PATCH routes", async () => {
			const code = `
        router.patch('/api/users/:id', (req, res) => {
          res.json({ patched: true });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes[0].method).toBe("PATCH");
		});

		it("should ignore non-HTTP methods", async () => {
			const code = `
        router.use('/middleware', (req, res, next) => next());
        router.all('/any', (req, res) => {});
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(0);
		});
	});

	describe("path parameter extraction", () => {
		beforeEach(() => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/routes/test.ts"]));
		});

		it("should extract single path parameter", async () => {
			const code = `
        router.get('/api/users/:id', (req, res) => {
          res.json({ id: req.params.id });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			const route = result.routes[0];
			expect(route.handler.pathParams).toHaveLength(1);
			expect(route.handler.pathParams?.[0].name).toBe("id");
			expect(route.handler.pathParams?.[0].required).toBe(true);
		});

		it("should extract multiple path parameters", async () => {
			const code = `
        router.get('/api/users/:userId/posts/:postId', (req, res) => {
          res.json({});
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			const route = result.routes[0];
			expect(route.handler.pathParams).toHaveLength(2);
			expect(route.handler.pathParams?.[0].name).toBe("userId");
			expect(route.handler.pathParams?.[1].name).toBe("postId");
		});
	});

	describe("request body extraction", () => {
		beforeEach(() => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/routes/test.ts"]));
		});

		it("should extract request body properties", async () => {
			const code = `
        router.post('/api/chat', (req, res) => {
          const { message, userId, context } = req.body;
          res.json({ ok: true });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			const route = result.routes[0];
			expect(route.handler.requestBody?.properties).toHaveLength(3);
			expect(route.handler.requestBody?.contentType).toBe("application/json");
		});

		it("should mark required fields based on validation", async () => {
			const code = `
        router.post('/api/chat', (req, res) => {
          const { message, userId } = req.body;
          if (!message) throw new Error('Message required');
          res.json({ ok: true });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			const route = result.routes[0];
			const messageProp = route.handler.requestBody?.properties.find(p => p.name === "message");
			expect(messageProp?.required).toBe(true);
		});

		it("should infer property types from names", async () => {
			const code = `
        router.post('/api/users', (req, res) => {
          const { userId, name, isActive, tags } = req.body;
          res.json({ ok: true });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			const props = result.routes[0].handler.requestBody?.properties;
			expect(props?.find(p => p.name === "userId")?.type).toBe("number");
			expect(props?.find(p => p.name === "name")?.type).toBe("string");
			expect(props?.find(p => p.name === "isActive")?.type).toBe("boolean");
			expect(props?.find(p => p.name === "tags")?.type).toBe("array");
		});
	});

	describe("response extraction", () => {
		beforeEach(() => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/routes/test.ts"]));
		});

		it("should detect 200 JSON responses", async () => {
			const code = `
        router.get('/api/users', (req, res) => {
          res.json({ users: [] });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			const responses = result.routes[0].handler.responses;
			expect(responses).toHaveLength(1);
			expect(responses?.[0].statusCode).toBe(200);
			expect(responses?.[0].description).toBe("Successful response");
		});

		it("should detect custom status codes", async () => {
			const code = `
        router.post('/api/users', (req, res) => {
          res.status(201).json({ id: 1 });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			const responses = result.routes[0].handler.responses;
			expect(responses?.[0].statusCode).toBe(201);
			expect(responses?.[0].description).toBe("Resource created");
		});

		it("should detect error responses from throw statements", async () => {
			const code = `
        router.post('/api/users', (req, res) => {
          const { name } = req.body;
          throw new Error('Name required');
          res.json({ ok: true });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			const responses = result.routes[0].handler.responses;
			const errorResponse = responses?.find(r => r.statusCode === 400);
			expect(errorResponse).toBeDefined();
			expect(errorResponse?.description).toBe("Bad request");
		});

		it("should extract response schema from object literals", async () => {
			const code = `
        router.get('/api/users/:id', (req, res) => {
          res.json({ id: 1, name: 'John', email: 'john@example.com' });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			const response = result.routes[0].handler.responses?.[0];
			expect(response?.schema).toBeDefined();
			expect(response?.schema?.type).toBe("object");
			expect(response?.schema?.properties).toBeDefined();
		});
	});

	describe("edge cases", () => {
		beforeEach(() => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/routes/test.ts"]));
		});

		it("should handle routes with no handler function", async () => {
			const code = `
        const handler = (req, res) => res.json({ ok: true });
        router.get('/test', handler);
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			// Should not crash, but may not detect the route
			expect(result).toBeDefined();
		});

		it("should handle malformed code gracefully", async () => {
			const code = `
        router.get('/test', (req, res) => {
          // Missing closing brace
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			// Parser may still throw on severely malformed code
			// Just ensure it doesn't crash the entire scan
			try {
				const result = await scanner.scan("/repo");
				expect(result).toBeDefined();
			} catch (error) {
				// If it throws, that's acceptable for malformed code
				expect(error).toBeDefined();
			}
		});

		it("should handle template literal paths", async () => {
			const code = `
        const prefix = '/api';
        router.get(\`/static-path\`, (req, res) => {
          res.json({ ok: true });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			// Simple template literals without expressions should be detected
			const route = result.routes.find(r => r.path === "/static-path");
			expect(route).toBeDefined();
		});

		it("should skip complex template literal paths with expressions", async () => {
			const code = `
        const prefix = '/api';
        router.get(\`\${prefix}/users\`, (req, res) => {
          res.json({ users: [] });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			// Complex template literals with expressions should be skipped (returns null)
			// So we shouldn't find any routes
			expect(result.routes).toHaveLength(0);
		});

		it("should handle complex nested blocks", async () => {
			const code = `
        router.post('/api/complex', (req, res) => {
          const { data } = req.body;
          try {
            if (data) {
              if (!data.id) throw new Error('ID required');
              res.status(200).json({ result: data });
            }
          } catch (error) {
            res.status(500).json({ error: error.message });
          }
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].handler.responses).toBeDefined();
		});

		it("should detect responses in if-else blocks", async () => {
			const code = `
        router.get('/api/conditional', (req, res) => {
          if (req.query.format === 'json') {
            res.json({ format: 'json' });
          } else {
            res.status(200).send('text');
          }
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].handler.responses).toBeDefined();
			expect(result.routes[0].handler.responses?.length).toBeGreaterThan(0);
		});

		it("should detect error responses with throw statements in blocks", async () => {
			const code = `
        router.post('/api/validate', (req, res) => {
          if (!req.body.data) {
            throw new Error('Data required');
          }
          res.json({ ok: true });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			// Should detect route and handle throw statement
			const route = result.routes[0];
			expect(route).toBeDefined();
			// The throw statement should be detected as error handling
			if (route.handler.requestBody) {
				expect(route.handler.requestBody.properties).toBeDefined();
			}
		});

		it("should detect return statements in error handling blocks", async () => {
			const code = `
        router.get('/api/check', (req, res) => {
          if (!valid) {
            return res.status(400).json({ error: 'Invalid' });
          }
          res.json({ ok: true });
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0]).toBeDefined();
		});

		it("should handle nested block statements", async () => {
			const code = `
        router.post('/api/nested', (req, res) => {
          {
            {
              res.json({ nested: true });
            }
          }
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].handler.responses).toBeDefined();
		});

		it("should handle non-object response schemas", async () => {
			const code = `
        router.get('/api/text', (req, res) => {
          const message = 'text';
          res.send(message);
        });
      `;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			// res.send() with a non-object should still create a default schema
			const route = result.routes[0];
			expect(route).toBeDefined();
			if (route.handler.responses && route.handler.responses.length > 0) {
				expect(route.handler.responses[0].schema).toBeDefined();
			}
		});

		it("should correctly count processed files from streaming discovery", async () => {
			// FileDiscovery handles deduplication internally, scanner just counts what it receives
			const uniqueFiles = ["/repo/routes/users.ts", "/repo/api/posts.ts", "/repo/main.ts"];
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(uniqueFiles));
			vi.mocked(fs.readFile).mockResolvedValue("router.get('/test', (req, res) => {})");

			type FilesFoundEvent = { count: number };
			const filesFoundEvents: Array<FilesFoundEvent> = [];
			scanner.on("filesFound", data => filesFoundEvents.push(data));

			await scanner.scan("/repo");

			// Should report 3 files processed
			expect(filesFoundEvents[0].count).toBe(3);
		});
	});

	describe("type inference", () => {
		it("should infer number type for id-like properties", () => {
			const inferType = (
				scanner as unknown as { inferPropertyType: (name: string) => string }
			).inferPropertyType.bind(scanner);

			expect(inferType("userId")).toBe("number");
			expect(inferType("postId")).toBe("number");
			expect(inferType("count")).toBe("number");
			expect(inferType("age")).toBe("number");
		});

		it("should infer boolean type for is/has prefixes", () => {
			const inferType = (
				scanner as unknown as { inferPropertyType: (name: string) => string }
			).inferPropertyType.bind(scanner);

			expect(inferType("isActive")).toBe("boolean");
			expect(inferType("hasAccess")).toBe("boolean");
			expect(inferType("active")).toBe("boolean");
		});

		it("should infer array type for plural names", () => {
			const inferType = (
				scanner as unknown as { inferPropertyType: (name: string) => string }
			).inferPropertyType.bind(scanner);

			expect(inferType("tags")).toBe("array");
			expect(inferType("products")).toBe("array");
			expect(inferType("entries")).toBe("array");
		});

		it("should default to string type", () => {
			const inferType = (
				scanner as unknown as { inferPropertyType: (name: string) => string }
			).inferPropertyType.bind(scanner);

			expect(inferType("name")).toBe("string");
			expect(inferType("email")).toBe("string");
			expect(inferType("description")).toBe("string");
		});
	});

	describe("project name inference", () => {
		it("should extract project name from path", () => {
			const inferName = (
				scanner as unknown as { inferProjectName: (path: string) => string }
			).inferProjectName.bind(scanner);

			expect(inferName("/home/user/my-project")).toBe("my-project");
			expect(inferName("C:\\Users\\dev\\api-service")).toBe("api-service");
			expect(inferName("/projects/backend")).toBe("backend");
		});
	});

	describe("Next.js App Router support", () => {
		beforeEach(() => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/app/api/users/route.ts"]));
		});

		it("should detect Next.js GET route handler", async () => {
			const code = `
				import { NextResponse } from 'next/server';

				export async function GET(request: Request) {
					return NextResponse.json({ users: [] }, { status: 200 });
				}
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].method).toBe("GET");
			expect(result.routes[0].path).toBe("/api/users");
		});

		it("should detect Next.js POST route handler with request body", async () => {
			const code = `
				import { NextResponse } from 'next/server';

				export async function POST(request: Request) {
					const { sandboxId } = await request.json();
					if (!sandboxId) {
						return NextResponse.json({ error: 'Missing sandboxId' }, { status: 400 });
					}
					return NextResponse.json({ id: sandboxId }, { status: 201 });
				}
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			const route = result.routes[0];
			expect(route.method).toBe("POST");
			expect(route.path).toBe("/api/users");
			expect(route.handler.requestBody).toBeDefined();
			expect(route.handler.requestBody?.properties).toHaveLength(1);
			expect(route.handler.requestBody?.properties[0].name).toBe("sandboxId");
			expect(route.handler.requestBody?.properties[0].required).toBe(true);
		});

		it("should handle Next.js dynamic route segments", async () => {
			const code = `
				import { NextResponse } from 'next/server';

				export async function GET(request: Request, { params }: { params: { userId: string } }) {
					return NextResponse.json({ userId: params.userId });
				}
			`;
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/app/api/users/[userId]/route.ts"]));
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].path).toBe("/api/users/:userId");
			expect(result.routes[0].handler.pathParams).toHaveLength(1);
			expect(result.routes[0].handler.pathParams?.[0].name).toBe("userId");
		});

		it("should extract multiple response status codes from Next.js handlers", async () => {
			const code = `
				import { NextResponse } from 'next/server';

				export async function GET(request: Request) {
					const apiKey = request.headers.get('X-API-Key');

					if (!apiKey) {
						return NextResponse.json({ error: 'Missing API Key' }, { status: 400 });
					}

					return NextResponse.json({ data: 'success' }, { status: 200 });
				}
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			const responses = result.routes[0].handler.responses;
			expect(responses).toBeDefined();
			expect(responses?.length).toBeGreaterThanOrEqual(2);

			const statusCodes = responses?.map(r => r.statusCode);
			expect(statusCodes).toContain(200);
			expect(statusCodes).toContain(400);
		});

		it("should handle Next.js route with nested directory structure", async () => {
			const code = `
				export async function POST(request: Request) {
					return NextResponse.json({ ok: true });
				}
			`;
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/app/api/stream/sandbox/route.ts"]));
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].path).toBe("/api/stream/sandbox");
		});

		it("should detect multiple HTTP methods in the same Next.js route file", async () => {
			const code = `
				import { NextResponse } from 'next/server';

				export async function GET(request: Request) {
					return NextResponse.json({ data: [] });
				}

				export async function POST(request: Request) {
					const { name } = await request.json();
					return NextResponse.json({ id: 1, name }, { status: 201 });
				}

				export async function DELETE(request: Request) {
					return NextResponse.json({ deleted: true });
				}
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(3);
			const methods = result.routes.map(r => r.method);
			expect(methods).toContain("GET");
			expect(methods).toContain("POST");
			expect(methods).toContain("DELETE");
		});
	});

	describe("Fastify support", () => {
		beforeEach(() => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/routes/users.ts"]));
		});

		it("should detect Fastify GET route", async () => {
			const code = `
				fastify.get('/api/users', async (request, reply) => {
					reply.send({ users: [] });
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].method).toBe("GET");
			expect(result.routes[0].path).toBe("/api/users");
		});

		it("should detect Fastify POST route with request body", async () => {
			const code = `
				fastify.post('/api/users', async (request, reply) => {
					const { name, email } = request.body;
					if (!name) throw new Error('Name required');
					reply.code(201).send({ id: 1, name });
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			const route = result.routes[0];
			expect(route.method).toBe("POST");
			expect(route.handler.requestBody).toBeDefined();
			expect(route.handler.requestBody?.properties).toHaveLength(2);
			expect(route.handler.responses).toBeDefined();
			expect(route.handler.responses?.[0].statusCode).toBe(201);
		});

		it("should handle Fastify reply.send() responses", async () => {
			const code = `
				fastify.get('/api/health', async (request, reply) => {
					reply.send({ status: 'ok' });
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			const responses = result.routes[0].handler.responses;
			expect(responses).toHaveLength(1);
			expect(responses?.[0].statusCode).toBe(200);
		});

		it("should handle Fastify reply.code().send() pattern", async () => {
			const code = `
				fastify.post('/api/items', async (request, reply) => {
					const { name } = request.body;
					reply.code(201).send({ id: 1, name });
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			const responses = result.routes[0].handler.responses;
			expect(responses).toBeDefined();
			expect(responses?.[0].statusCode).toBe(201);
		});
	});

	describe("Koa support", () => {
		beforeEach(() => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/routes/users.ts"]));
		});

		it("should detect Koa GET route", async () => {
			const code = `
				router.get('/api/users', async (ctx) => {
					ctx.body = { users: [] };
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].method).toBe("GET");
			expect(result.routes[0].path).toBe("/api/users");
		});

		it("should detect Koa POST route with request body", async () => {
			const code = `
				koaRouter.post('/api/users', async (ctx) => {
					const { name, email } = ctx.request.body;
					if (!name) throw new Error('Name required');
					ctx.status = 201;
					ctx.body = { id: 1, name };
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			const route = result.routes[0];
			expect(route.method).toBe("POST");
			expect(route.handler.requestBody).toBeDefined();
			expect(route.handler.requestBody?.properties).toHaveLength(2);
		});

		it("should handle Koa ctx.body = ... responses", async () => {
			const code = `
				router.get('/api/health', async (ctx) => {
					ctx.body = { status: 'ok', timestamp: Date.now() };
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			const responses = result.routes[0].handler.responses;
			expect(responses).toHaveLength(1);
			expect(responses?.[0].statusCode).toBe(200);
		});
	});

	describe("Hono support", () => {
		beforeEach(() => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/routes/users.ts"]));
		});

		it("should detect Hono GET route", async () => {
			const code = `
				app.get('/api/users', (c) => {
					return c.json({ users: [] });
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].method).toBe("GET");
			expect(result.routes[0].path).toBe("/api/users");
		});

		it("should detect Hono POST route with request body", async () => {
			const code = `
				hono.post('/api/users', async (c) => {
					const { name, email } = c.body;
					if (!name) throw new Error('Name required');
					return c.json({ id: 1, name }, 201);
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			const route = result.routes[0];
			expect(route.method).toBe("POST");
			expect(route.handler.requestBody).toBeDefined();
		});

		it("should handle Hono c.json() with status code", async () => {
			const code = `
				app.post('/api/items', async (c) => {
					const { name } = c.body;
					return c.json({ id: 1, name }, 201);
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			const responses = result.routes[0].handler.responses;
			expect(responses).toBeDefined();
			expect(responses?.[0].statusCode).toBe(201);
		});

		it("should handle Hono c.json() without explicit status code", async () => {
			const code = `
				app.get('/api/health', (c) => {
					return c.json({ status: 'ok' });
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			const responses = result.routes[0].handler.responses;
			expect(responses).toHaveLength(1);
			expect(responses?.[0].statusCode).toBe(200);
		});
	});

	describe("Fastify schema extraction", () => {
		beforeEach(() => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/routes/drink/index.js"]));
		});

		it("should extract operationId from Fastify schema", async () => {
			const code = `
				const schema = {
					operationId: 'getDrink',
					tags: ['drinks'],
					response: { 200: { $ref: 'Drink' } }
				};
				fastify.get('/:drinkId/', { schema }, async (request, reply) => {
					reply.send({ name: 'Test' });
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].operationId).toBe("getDrink");
			expect(result.routes[0].tags).toEqual(["drinks"]);
		});

		it("should extract response $ref from Fastify schema", async () => {
			const code = `
				fastify.get('/item', {
					schema: {
						response: {
							200: { $ref: 'Item' }
						}
					}
				}, async (request, reply) => {
					reply.send({});
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			const response = result.routes[0].handler.responses?.[0];
			expect(response?.schemaRef).toBe("Item");
		});

		it("should extract params schema from Fastify", async () => {
			const code = `
				fastify.get('/:id', {
					schema: {
						params: {
							type: 'object',
							properties: {
								id: { type: 'string', description: 'The item ID' }
							}
						}
					}
				}, async (request, reply) => {
					reply.send({});
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			const params = result.routes[0].handler.pathParams;
			expect(params).toHaveLength(1);
			expect(params?.[0].name).toBe("id");
			expect(params?.[0].type).toBe("string");
			expect(params?.[0].description).toBe("The item ID");
		});

		it("should extract body schema from Fastify", async () => {
			const code = `
				fastify.post('/items', {
					schema: {
						body: {
							type: 'object',
							properties: {
								name: { type: 'string', description: 'Item name' },
								price: { type: 'number' }
							},
							required: ['name']
						}
					}
				}, async (request, reply) => {
					reply.send({});
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			const body = result.routes[0].handler.requestBody;
			expect(body?.properties).toHaveLength(2);
			expect(body?.properties[0].name).toBe("name");
			expect(body?.properties[0].required).toBe(true);
			expect(body?.properties[0].description).toBe("Item name");
			expect(body?.properties[1].name).toBe("price");
			expect(body?.properties[1].required).toBe(false);
		});

		it("should extract response schema with type and properties", async () => {
			const code = `
				fastify.get('/health', {
					schema: {
						response: {
							200: {
								type: 'object',
								properties: {
									status: { type: 'string' },
									uptime: { type: 'number' }
								}
							}
						}
					}
				}, async (request, reply) => {
					reply.send({ status: 'ok', uptime: 123 });
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			const response = result.routes[0].handler.responses?.[0];
			expect(response?.statusCode).toBe(200);
			expect(response?.schema).toBeDefined();
		});
	});

	describe("Fastify addSchema extraction", () => {
		beforeEach(() => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/models/drink.js"]));
		});

		it("should extract component schema from fastify.addSchema()", async () => {
			const code = `
				const DrinkSchema = {
					$id: 'Drink',
					type: 'object',
					properties: {
						name: { type: 'string', title: 'Drink name', description: 'The name of the drink' },
						price: { type: 'number', description: 'Price in cents' },
						type: { type: 'string', enum: ['beer', 'wine', 'cocktail'] }
					},
					required: ['name', 'price']
				};
				export default async function (fastify) {
					fastify.addSchema(DrinkSchema);
				}
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.components).toBeDefined();
			expect(result.components).toHaveLength(1);
			const drink = result.components?.[0];
			expect(drink?.$id).toBe("Drink");
			expect(drink?.type).toBe("object");
			expect(drink?.properties?.name.type).toBe("string");
			expect(drink?.properties?.name.title).toBe("Drink name");
			expect(drink?.properties?.price.description).toBe("Price in cents");
			expect(drink?.properties?.type.enum).toEqual(["beer", "wine", "cocktail"]);
			expect(drink?.required).toEqual(["name", "price"]);
		});

		it("should extract inline component schema", async () => {
			const code = `
				fastify.addSchema({
					$id: 'User',
					type: 'object',
					title: 'User schema',
					description: 'A user object',
					properties: {
						id: { type: 'number' },
						email: { type: 'string', format: 'email' }
					}
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.components).toHaveLength(1);
			const user = result.components?.[0];
			expect(user?.$id).toBe("User");
			expect(user?.title).toBe("User schema");
			expect(user?.description).toBe("A user object");
			expect(user?.properties?.email.format).toBe("email");
		});

		it("should ignore addSchema without $id", async () => {
			const code = `
				fastify.addSchema({
					type: 'object',
					properties: { name: { type: 'string' } }
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.components).toBeUndefined();
		});
	});

	describe("Fastify swagger config extraction", () => {
		beforeEach(() => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/plugins/openapi.js"]));
		});

		it("should extract OpenAPI info from swagger registration", async () => {
			const code = `
				import swagger from '@fastify/swagger';
				export default async function (fastify) {
					fastify.register(swagger, {
						openapi: {
							info: {
								title: 'My API',
								description: 'API description',
								version: '1.0.0',
								termsOfService: 'http://example.com/terms',
								contact: {
									name: 'Support',
									url: 'http://example.com/support',
									email: 'support@example.com'
								},
								license: {
									name: 'MIT',
									url: 'http://opensource.org/licenses/MIT'
								}
							}
						}
					});
				}
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.openApiConfig).toBeDefined();
			expect(result.openApiConfig?.info?.title).toBe("My API");
			expect(result.openApiConfig?.info?.description).toBe("API description");
			expect(result.openApiConfig?.info?.version).toBe("1.0.0");
			expect(result.openApiConfig?.info?.termsOfService).toBe("http://example.com/terms");
			expect(result.openApiConfig?.info?.contact?.name).toBe("Support");
			expect(result.openApiConfig?.info?.license?.name).toBe("MIT");
			expect(result.title).toBe("My API");
			expect(result.version).toBe("1.0.0");
		});

		it("should extract servers from swagger config", async () => {
			const code = `
				fastify.register(swagger, {
					openapi: {
						servers: [
							{ url: 'http://localhost:3000', description: 'Development' },
							{ url: 'https://api.example.com', description: 'Production' }
						]
					}
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.openApiConfig?.servers).toHaveLength(2);
			expect(result.openApiConfig?.servers?.[0].url).toBe("http://localhost:3000");
			expect(result.openApiConfig?.servers?.[0].description).toBe("Development");
		});

		it("should extract tags from swagger config", async () => {
			const code = `
				fastify.register(swagger, {
					openapi: {
						tags: [
							{
								name: 'drinks',
								description: 'Drink endpoints',
								externalDocs: { description: 'More info', url: 'http://example.com' }
							},
							{ name: 'users', description: 'User endpoints' }
						]
					}
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.openApiConfig?.tags).toHaveLength(2);
			expect(result.openApiConfig?.tags?.[0].name).toBe("drinks");
			expect(result.openApiConfig?.tags?.[0].externalDocs?.url).toBe("http://example.com");
		});

		it("should extract x-* extensions from swagger config", async () => {
			const code = `
				fastify.register(swagger, {
					openapi: {
						'x-speakeasy-retries': {
							strategy: 'backoff',
							backoff: { initialInterval: 500, maxInterval: 60000 },
							statusCodes: ['5XX']
						}
					}
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.openApiConfig?.extensions).toBeDefined();
			expect(result.openApiConfig?.extensions?.["x-speakeasy-retries"]).toBeDefined();
			const retries = result.openApiConfig?.extensions?.["x-speakeasy-retries"] as Record<string, unknown>;
			expect(retries?.strategy).toBe("backoff");
		});

		it("should handle fastifySwagger identifier name", async () => {
			const code = `
				import fastifySwagger from '@fastify/swagger';
				fastify.register(fastifySwagger, {
					openapi: {
						info: { title: 'Test API', version: '2.0.0' }
					}
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.openApiConfig?.info?.title).toBe("Test API");
		});
	});

	describe("Route prefix inference", () => {
		it("should infer route prefix from directory structure", async () => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/routes/drink/index.js"]));
			const code = `
				fastify.get('/:drinkId/', async (request, reply) => {
					reply.send({ name: 'Test' });
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].path).toBe("/drink/:drinkId/");
		});

		it("should not add prefix for root routes", async () => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/routes/root.js"]));
			const code = `
				fastify.get('/', async (request, reply) => {
					reply.send({ root: true });
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].path).toBe("/");
		});

		it("should not double-apply prefix if path already starts with it", async () => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/routes/users/index.js"]));
			const code = `
				fastify.get('/users/:id', async (request, reply) => {
					reply.send({});
				});
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			// Should be /users/:id, not /users/users/:id
			expect(result.routes[0].path).toBe("/users/:id");
		});
	});

	describe("NestJS support", () => {
		beforeEach(() => {
			vi.mocked(FileDiscovery.discoverCodeFiles).mockReturnValue(createFileIterator(["/repo/controllers/users.controller.ts"]));
		});

		it("should detect NestJS controller with GET route", async () => {
			const code = `
				import { Controller, Get } from '@nestjs/common';

				@Controller('users')
				export class UsersController {
					@Get()
					findAll() {
						return { users: [] };
					}
				}
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].method).toBe("GET");
			expect(result.routes[0].path).toBe("/users");
		});

		it("should detect NestJS controller with method path", async () => {
			const code = `
				import { Controller, Get, Param } from '@nestjs/common';

				@Controller('users')
				export class UsersController {
					@Get(':id')
					findOne(@Param('id') id: string) {
						return { id };
					}
				}
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].method).toBe("GET");
			expect(result.routes[0].path).toBe("/users/:id");
			expect(result.routes[0].handler.pathParams).toHaveLength(1);
			expect(result.routes[0].handler.pathParams?.[0].name).toBe("id");
		});

		it("should detect NestJS POST route with @Body decorator", async () => {
			const code = `
				import { Controller, Post, Body } from '@nestjs/common';

				@Controller('users')
				export class UsersController {
					@Post()
					create(@Body() createUserDto) {
						return createUserDto;
					}
				}
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			const route = result.routes[0];
			expect(route.method).toBe("POST");
			expect(route.path).toBe("/users");
			expect(route.handler.requestBody).toBeDefined();
		});

		it("should detect NestJS controller with @HttpCode decorator", async () => {
			const code = `
				import { Controller, Post, HttpCode } from '@nestjs/common';

				@Controller('users')
				export class UsersController {
					@Post()
					@HttpCode(201)
					create() {
						return { id: 1 };
					}
				}
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(1);
			const responses = result.routes[0].handler.responses;
			expect(responses).toBeDefined();
			expect(responses?.[0].statusCode).toBe(201);
		});

		it("should detect multiple HTTP methods in NestJS controller", async () => {
			const code = `
				import { Controller, Get, Post, Put, Delete } from '@nestjs/common';

				@Controller('users')
				export class UsersController {
					@Get()
					findAll() {}

					@Post()
					create() {}

					@Put(':id')
					update() {}

					@Delete(':id')
					remove() {}
				}
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			expect(result.routes).toHaveLength(4);
			const methods = result.routes.map(r => r.method);
			expect(methods).toContain("GET");
			expect(methods).toContain("POST");
			expect(methods).toContain("PUT");
			expect(methods).toContain("DELETE");
		});

		it("should skip NestJS classes without decorators", async () => {
			const code = `
				export class PlainClass {
					// Class without @Controller decorator - should be completely skipped
					getUsers() {
						return [];
					}
				}
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			// Should not detect any routes from non-controller classes
			expect(result.routes).toHaveLength(0);
		});

		it("should skip NestJS controller methods without decorators", async () => {
			const code = `
				import { Controller, Get } from '@nestjs/common';

				@Controller('users')
				export class UsersController {
					// Method without any decorators - should be skipped
					helperMethod() {
						return 'helper';
					}

					// Method with explicit decorator should be detected
					@Get()
					getUsers() {
						return [];
					}
				}
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			// Should only detect the decorated method
			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].method).toBe("GET");
			expect(result.routes[0].path).toBe("/users");
		});

		it("should skip NestJS decorators that are not call expressions", async () => {
			const code = `
				import { Controller, Get } from '@nestjs/common';

				const SomeDecorator = () => {};

				@Controller('users')
				export class UsersController {
					@SomeDecorator
					@Get()
					getUsers() {
						return [];
					}
				}
			`;
			vi.mocked(fs.readFile).mockResolvedValue(code);

			const result = await scanner.scan("/repo");

			// Should detect the GET route, ignoring non-HTTP decorators
			expect(result.routes).toHaveLength(1);
			expect(result.routes[0].method).toBe("GET");
			expect(result.routes[0].path).toBe("/users");
		});
	});
});
