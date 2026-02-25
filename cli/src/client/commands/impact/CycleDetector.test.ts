import {
	CycleDetector,
	advancePropagationState,
	createPropagationState,
	shouldProcess,
	type PropagationState,
} from "./CycleDetector";
import { describe, expect, test, beforeEach } from "vitest";

describe("CycleDetector", () => {
	describe("createPropagationState", () => {
		test("creates state with default maxDepth of 5", () => {
			const state = createPropagationState();
			expect(state.maxDepth).toBe(5);
			expect(state.depth).toBe(0);
			expect(state.visited.size).toBe(0);
			expect(state.path).toEqual([]);
		});

		test("creates state with custom maxDepth", () => {
			const state = createPropagationState(10);
			expect(state.maxDepth).toBe(10);
		});

		test("creates state with empty visited set", () => {
			const state = createPropagationState();
			expect(state.visited).toBeInstanceOf(Set);
			expect(state.visited.size).toBe(0);
		});
	});

	describe("shouldProcess", () => {
		test("returns allowed true for new JRN", () => {
			const state = createPropagationState();
			const result = shouldProcess("DOC_001", state);
			expect(result.allowed).toBe(true);
			expect(result.reason).toBeUndefined();
		});

		test("returns allowed false for visited JRN", () => {
			const state: PropagationState = {
				visited: new Set(["DOC_001"]),
				depth: 0,
				maxDepth: 5,
				path: [],
			};
			const result = shouldProcess("DOC_001", state);
			expect(result.allowed).toBe(false);
			expect(result.reason).toBe("Cycle detected: DOC_001 already processed in this cascade");
		});

		test("returns allowed false when max depth reached", () => {
			const state: PropagationState = {
				visited: new Set(),
				depth: 5,
				maxDepth: 5,
				path: [],
			};
			const result = shouldProcess("DOC_001", state);
			expect(result.allowed).toBe(false);
			expect(result.reason).toBe("Max depth 5 reached, stopping propagation");
		});

		test("returns allowed true when depth is below max", () => {
			const state: PropagationState = {
				visited: new Set(),
				depth: 4,
				maxDepth: 5,
				path: [],
			};
			const result = shouldProcess("DOC_001", state);
			expect(result.allowed).toBe(true);
		});

		test("prefers cycle detection over depth limit in error message", () => {
			const state: PropagationState = {
				visited: new Set(["DOC_001"]),
				depth: 5,
				maxDepth: 5,
				path: [],
			};
			const result = shouldProcess("DOC_001", state);
			expect(result.allowed).toBe(false);
			expect(result.reason).toContain("Cycle detected");
		});
	});

	describe("advancePropagationState", () => {
		test("adds JRN to visited set", () => {
			const state = createPropagationState();
			const advanced = advancePropagationState(state, "DOC_001");
			expect(advanced.visited.has("DOC_001")).toBe(true);
		});

		test("increments depth by 1", () => {
			const state = createPropagationState();
			const advanced = advancePropagationState(state, "DOC_001");
			expect(advanced.depth).toBe(1);
		});

		test("appends JRN to path", () => {
			const state = createPropagationState();
			const advanced = advancePropagationState(state, "DOC_001");
			expect(advanced.path).toEqual(["DOC_001"]);
		});

		test("preserves maxDepth", () => {
			const state = createPropagationState(10);
			const advanced = advancePropagationState(state, "DOC_001");
			expect(advanced.maxDepth).toBe(10);
		});

		test("does not mutate original state", () => {
			const state = createPropagationState();
			advancePropagationState(state, "DOC_001");
			expect(state.visited.size).toBe(0);
			expect(state.depth).toBe(0);
			expect(state.path).toEqual([]);
		});

		test("preserves existing visited entries", () => {
			const state: PropagationState = {
				visited: new Set(["DOC_001"]),
				depth: 1,
				maxDepth: 5,
				path: ["DOC_001"],
			};
			const advanced = advancePropagationState(state, "DOC_002");
			expect(advanced.visited.has("DOC_001")).toBe(true);
			expect(advanced.visited.has("DOC_002")).toBe(true);
			expect(advanced.visited.size).toBe(2);
		});

		test("builds path correctly through multiple advances", () => {
			let state = createPropagationState();
			state = advancePropagationState(state, "DOC_001");
			state = advancePropagationState(state, "DOC_002");
			state = advancePropagationState(state, "DOC_003");
			expect(state.path).toEqual(["DOC_001", "DOC_002", "DOC_003"]);
			expect(state.depth).toBe(3);
		});
	});

	describe("CycleDetector class", () => {
		let detector: CycleDetector;

		beforeEach(() => {
			detector = new CycleDetector();
		});

		describe("markVisited and hasVisited", () => {
			test("hasVisited returns false for unvisited JRN", () => {
				expect(detector.hasVisited("DOC_001")).toBe(false);
			});

			test("hasVisited returns true after markVisited", () => {
				detector.markVisited("DOC_001");
				expect(detector.hasVisited("DOC_001")).toBe(true);
			});

			test("tracks multiple visited JRNs", () => {
				detector.markVisited("DOC_001");
				detector.markVisited("DOC_002");
				detector.markVisited("DOC_003");
				expect(detector.hasVisited("DOC_001")).toBe(true);
				expect(detector.hasVisited("DOC_002")).toBe(true);
				expect(detector.hasVisited("DOC_003")).toBe(true);
				expect(detector.hasVisited("DOC_004")).toBe(false);
			});
		});

		describe("pushPath and popPath", () => {
			test("pushPath adds JRN to path", () => {
				detector.pushPath("DOC_001");
				expect(detector.getPath()).toEqual(["DOC_001"]);
			});

			test("popPath removes last JRN from path", () => {
				detector.pushPath("DOC_001");
				detector.pushPath("DOC_002");
				detector.popPath();
				expect(detector.getPath()).toEqual(["DOC_001"]);
			});

			test("builds path correctly", () => {
				detector.pushPath("DOC_001");
				detector.pushPath("DOC_002");
				detector.pushPath("DOC_003");
				expect(detector.getPath()).toEqual(["DOC_001", "DOC_002", "DOC_003"]);
			});

			test("popPath on empty path does nothing", () => {
				detector.popPath();
				expect(detector.getPath()).toEqual([]);
			});
		});

		describe("getPath", () => {
			test("returns copy of path (immutable)", () => {
				detector.pushPath("DOC_001");
				const path = detector.getPath();
				detector.pushPath("DOC_002");
				expect(path).toEqual(["DOC_001"]);
			});
		});

		describe("getVisited", () => {
			test("returns visited set", () => {
				detector.markVisited("DOC_001");
				detector.markVisited("DOC_002");
				const visited = detector.getVisited();
				expect(visited.has("DOC_001")).toBe(true);
				expect(visited.has("DOC_002")).toBe(true);
				expect(visited.size).toBe(2);
			});
		});

		describe("reset", () => {
			test("clears visited set", () => {
				detector.markVisited("DOC_001");
				detector.markVisited("DOC_002");
				detector.reset();
				expect(detector.hasVisited("DOC_001")).toBe(false);
				expect(detector.hasVisited("DOC_002")).toBe(false);
			});

			test("clears path", () => {
				detector.pushPath("DOC_001");
				detector.pushPath("DOC_002");
				detector.reset();
				expect(detector.getPath()).toEqual([]);
			});

			test("allows reuse after reset", () => {
				detector.markVisited("DOC_001");
				detector.pushPath("DOC_001");
				detector.reset();

				detector.markVisited("DOC_002");
				detector.pushPath("DOC_002");
				expect(detector.hasVisited("DOC_001")).toBe(false);
				expect(detector.hasVisited("DOC_002")).toBe(true);
				expect(detector.getPath()).toEqual(["DOC_002"]);
			});
		});
	});
});
