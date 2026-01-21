// biome-ignore lint/style/noRestrictedImports: Local manual test script imports internal module directly
import { CodeScanner } from "./src/core/scanners/CodeScanner.ts";

async function testScanner() {
	const scanner = new CodeScanner();

	scanner.on("filesFound", data => console.log("Files found:", data));
	scanner.on("file", file => console.log("Scanning file:", file));
	scanner.on("routeFound", route => console.log("Route found:", route));
	scanner.on("error", err => console.error("Error:", err));
	scanner.on("progress", data => console.log("Progress:", data));

	try {
		const result = await scanner.scan("/Users/phunguyen/Documents/GitHub/phu-experiments");
		console.log("Total routes found:", result.routes.length);
		console.log("Routes:", JSON.stringify(result.routes, null, 2));
	} catch (err) {
		console.error("Scan failed:", err);
	}
}

testScanner();
