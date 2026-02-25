/**
 * GitDiffParser Tests
 */

import { extractContext, parseUnifiedDiff } from "./GitDiffParser";
import { describe, expect, it } from "bun:test";

describe("GitDiffParser", () => {
	describe("parseUnifiedDiff", () => {
		it("parses a simple diff with one hunk", () => {
			const diff = `diff --git a/src/foo.ts b/src/foo.ts
index 1234567..abcdefg 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -10,6 +10,7 @@ export function foo() {
   const a = 1;
   const b = 2;
+  const c = 3;
   return a + b;
 }`;

			const hunks = parseUnifiedDiff(diff);

			expect(hunks).toHaveLength(1);
			expect(hunks[0].file).toBe("src/foo.ts");
			expect(hunks[0].oldStart).toBe(10);
			expect(hunks[0].oldCount).toBe(6);
			expect(hunks[0].newStart).toBe(10);
			expect(hunks[0].newCount).toBe(7);
			expect(hunks[0].lines).toContain("+  const c = 3;");
		});

		it("parses diff with multiple hunks in same file", () => {
			const diff = `diff --git a/src/bar.ts b/src/bar.ts
--- a/src/bar.ts
+++ b/src/bar.ts
@@ -1,3 +1,4 @@
+import { x } from "y";
 const foo = 1;
 const bar = 2;
 const baz = 3;
@@ -20,4 +21,5 @@ function helper() {
   return true;
 }
+
+export { helper };`;

			const hunks = parseUnifiedDiff(diff);

			expect(hunks).toHaveLength(2);
			expect(hunks[0].file).toBe("src/bar.ts");
			expect(hunks[0].oldStart).toBe(1);
			expect(hunks[1].file).toBe("src/bar.ts");
			expect(hunks[1].oldStart).toBe(20);
		});

		it("parses diff with multiple files", () => {
			const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 export { a };
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -5,3 +5,4 @@ function test() {
   console.log("test");
+  console.log("more");
 }`;

			const hunks = parseUnifiedDiff(diff);

			expect(hunks).toHaveLength(2);
			expect(hunks[0].file).toBe("src/a.ts");
			expect(hunks[1].file).toBe("src/b.ts");
		});

		it("handles hunk header without count (single line change)", () => {
			const diff = `diff --git a/src/single.ts b/src/single.ts
--- a/src/single.ts
+++ b/src/single.ts
@@ -5 +5 @@ const x = 1;
-const old = "value";
+const new = "value";`;

			const hunks = parseUnifiedDiff(diff);

			expect(hunks).toHaveLength(1);
			expect(hunks[0].oldCount).toBe(1);
			expect(hunks[0].newCount).toBe(1);
		});

		it("returns empty array for empty diff", () => {
			expect(parseUnifiedDiff("")).toEqual([]);
		});
	});

	describe("extractContext", () => {
		it("extracts TypeScript function name", () => {
			const lines = [
				" export function handleRequest(req: Request) {",
				"   const body = req.body;",
				"+  validate(body);",
				"   return process(body);",
			];

			expect(extractContext(lines)).toBe("handleRequest");
		});

		it("extracts TypeScript async function name", () => {
			const lines = [
				" export async function fetchData() {",
				"-  const data = await fetch(url);",
				"+  const data = await fetch(newUrl);",
			];

			expect(extractContext(lines)).toBe("fetchData");
		});

		it("extracts TypeScript class name", () => {
			const lines = [" export class UserService {", "   private db: Database;", "+  private cache: Cache;"];

			expect(extractContext(lines)).toBe("UserService");
		});

		it("extracts TypeScript arrow function", () => {
			const lines = [
				" const processItems = async (items: Item[]) => {",
				"+  items.forEach(validate);",
				"   return items.map(transform);",
			];

			expect(extractContext(lines)).toBe("processItems");
		});

		it("extracts Python function name", () => {
			const lines = [" def process_request(request):", "+    validate(request)", "     return handle(request)"];

			expect(extractContext(lines)).toBe("process_request");
		});

		it("extracts Python async function name", () => {
			const lines = [
				" async def fetch_data():",
				"-    data = await get_data()",
				"+    data = await get_new_data()",
			];

			expect(extractContext(lines)).toBe("fetch_data");
		});

		it("extracts Python class name", () => {
			const lines = [" class DataProcessor:", "+    cache = {}", "     def __init__(self):"];

			expect(extractContext(lines)).toBe("DataProcessor");
		});

		it("extracts Go function name", () => {
			const lines = [
				" func ProcessRequest(w http.ResponseWriter, r *http.Request) {",
				"+\tvalidate(r)",
				" \thandle(w, r)",
			];

			expect(extractContext(lines)).toBe("ProcessRequest");
		});

		it("extracts Go method name", () => {
			const lines = [
				" func (s *Server) HandleConnection(conn net.Conn) {",
				"+\ts.log(conn)",
				" \ts.process(conn)",
			];

			expect(extractContext(lines)).toBe("HandleConnection");
		});

		it("extracts Go struct name", () => {
			const lines = [" type UserService struct {", "+\tcache *Cache", " \tdb    *Database"];

			expect(extractContext(lines)).toBe("UserService");
		});

		it("extracts Rust function name", () => {
			const lines = [
				" pub fn process_data(data: &[u8]) -> Result<(), Error> {",
				"+    validate(data)?;",
				"     Ok(())",
			];

			expect(extractContext(lines)).toBe("process_data");
		});

		it("extracts Rust struct name", () => {
			const lines = [" pub struct Config {", "+    pub timeout: Duration,", "     pub retries: u32,"];

			expect(extractContext(lines)).toBe("Config");
		});

		it("extracts Rust impl block name", () => {
			const lines = [
				" impl UserService {",
				"+    pub fn new() -> Self {",
				"         Self { db: Database::new() }",
			];

			expect(extractContext(lines)).toBe("UserService");
		});

		it("extracts Java class name", () => {
			const lines = [
				" public class UserController {",
				"+    private final Logger logger;",
				"     private final UserService service;",
			];

			expect(extractContext(lines)).toBe("UserController");
		});

		it("extracts Java method name", () => {
			const lines = [
				" public ResponseEntity<User> getUser(Long id) throws NotFoundException {",
				'+    logger.info("Getting user");',
				"     return service.findById(id);",
			];

			expect(extractContext(lines)).toBe("getUser");
		});

		it("returns empty string when no context found", () => {
			const lines = ["+const x = 1;", "+const y = 2;"];

			expect(extractContext(lines)).toBe("");
		});
	});
});
