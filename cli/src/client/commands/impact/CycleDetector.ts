/**
 * Cycle Detector
 *
 * Detects and prevents infinite loops in article-to-article propagation.
 * Tracks visited articles and enforces a maximum propagation depth.
 */

/**
 * State for tracking propagation through the article graph.
 */
export interface PropagationState {
	/** JRNs already processed in this cascade */
	readonly visited: Set<string>;
	/** Current recursion depth */
	readonly depth: number;
	/** Maximum depth limit (safety limit) */
	readonly maxDepth: number;
	/** Current path for error reporting */
	readonly path: ReadonlyArray<string>;
}

/**
 * Result of checking whether a JRN should be processed.
 */
export interface ShouldProcessResult {
	readonly allowed: boolean;
	readonly reason?: string;
}

/**
 * Tracks visited articles and prevents cycles in propagation.
 */
export class CycleDetector {
	private visited: Set<string> = new Set();
	private currentPath: Array<string> = [];

	/**
	 * Marks a JRN as visited.
	 * @param jrn - The JRN to mark as visited
	 */
	markVisited(jrn: string): void {
		this.visited.add(jrn);
	}

	/**
	 * Checks if a JRN has been visited.
	 * @param jrn - The JRN to check
	 * @returns True if the JRN has been visited
	 */
	hasVisited(jrn: string): boolean {
		return this.visited.has(jrn);
	}

	/**
	 * Pushes a JRN onto the current path (for tracking the propagation chain).
	 * @param jrn - The JRN to push
	 */
	pushPath(jrn: string): void {
		this.currentPath.push(jrn);
	}

	/**
	 * Pops the last JRN from the current path.
	 */
	popPath(): void {
		this.currentPath.pop();
	}

	/**
	 * Gets the current propagation path.
	 * @returns The current path as a readonly array
	 */
	getPath(): ReadonlyArray<string> {
		return [...this.currentPath];
	}

	/**
	 * Gets all visited JRNs.
	 * @returns A set of all visited JRNs
	 */
	getVisited(): ReadonlySet<string> {
		return this.visited;
	}

	/**
	 * Resets the cycle detector to initial state.
	 */
	reset(): void {
		this.visited.clear();
		this.currentPath = [];
	}
}

/**
 * Creates a new propagation state for tracking propagation.
 * @param maxDepth - Maximum propagation depth (default: 5)
 * @returns A new PropagationState instance
 */
export function createPropagationState(maxDepth = 5): PropagationState {
	return {
		visited: new Set<string>(),
		depth: 0,
		maxDepth,
		path: [],
	};
}

/**
 * Checks if a JRN should be processed based on the current propagation state.
 * @param jrn - The JRN to check
 * @param state - The current propagation state
 * @returns Whether processing is allowed and the reason if not
 */
export function shouldProcess(jrn: string, state: PropagationState): ShouldProcessResult {
	if (state.visited.has(jrn)) {
		return {
			allowed: false,
			reason: `Cycle detected: ${jrn} already processed in this cascade`,
		};
	}

	if (state.depth >= state.maxDepth) {
		return {
			allowed: false,
			reason: `Max depth ${state.maxDepth} reached, stopping propagation`,
		};
	}

	return { allowed: true };
}

/**
 * Creates a new propagation state with the given JRN added to visited and path.
 * @param state - The current propagation state
 * @param jrn - The JRN to add
 * @returns A new PropagationState with the JRN added
 */
export function advancePropagationState(state: PropagationState, jrn: string): PropagationState {
	const newVisited = new Set(state.visited);
	newVisited.add(jrn);

	return {
		visited: newVisited,
		depth: state.depth + 1,
		maxDepth: state.maxDepth,
		path: [...state.path, jrn],
	};
}
