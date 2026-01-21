/**
 * Represents a single revision of a draft
 */
export interface Revision {
	/**
	 * Full content of the draft at this revision
	 */
	content: string;
	/**
	 * Timestamp of when the revision was made
	 */
	timestamp: Date;
	/**
	 * ID of the user who made the revision
	 */
	userId: number;
	/**
	 * Description of the revision (e.g., "Applied section changes", "Dismissed section changes")
	 */
	description: string;
	/**
	 * IDs of section changes that were applied in this revision.
	 */
	appliedChangeIds?: Array<number> | undefined;
	/**
	 * IDs of section changes that were dismissed in this revision.
	 */
	dismissedChangeIds?: Array<number> | undefined;
}

/**
 * Revision history for a draft
 */
interface RevisionHistory {
	revisions: Array<Revision>;
	currentIndex: number;
}

/**
 * Service for managing in-memory revision history for drafts
 * Supports undo/redo functionality with a configurable max number of revisions
 */
export class RevisionManager {
	private readonly histories = new Map<number, RevisionHistory>();
	private readonly maxRevisions: number;

	constructor(maxRevisions = 50) {
		this.maxRevisions = maxRevisions;
	}

	/**
	 * Adds a new revision to the history
	 * If we're not at the end of the history (user has undone), this will clear forward history
	 * @param draftId ID of the draft
	 * @param content Full content of the draft at this revision
	 * @param userId ID of the user who made the revision
	 * @param description Description of the revision
	 * @param appliedChangeIds Optional array of section change IDs that were applied in this revision
	 * @param dismissedChangeIds Optional array of section change IDs that were dismissed in this revision
	 */
	addRevision(
		draftId: number,
		content: string,
		userId: number,
		description: string,
		appliedChangeIds?: Array<number>,
		dismissedChangeIds?: Array<number>,
	): void {
		let history = this.histories.get(draftId);

		if (!history) {
			history = {
				revisions: [],
				currentIndex: -1,
			};
			this.histories.set(draftId, history);
		}

		// If we're not at the end of history, remove all forward revisions
		if (history.currentIndex < history.revisions.length - 1) {
			history.revisions = history.revisions.slice(0, history.currentIndex + 1);
		}

		// Add new revision
		const revision: Revision = {
			content,
			timestamp: new Date(),
			userId,
			description,
			appliedChangeIds,
			dismissedChangeIds,
		};

		history.revisions.push(revision);

		// Trim to max revisions if needed
		if (history.revisions.length > this.maxRevisions) {
			history.revisions.shift();
		} else {
			history.currentIndex++;
		}
	}

	/**
	 * Undoes the last change, returning the previous content and the change IDs that were undone or dismissed
	 * Returns undefined if there's nothing to undo
	 */
	undo(draftId: number):
		| {
				content: string;
				undoneChangeIds?: Array<number> | undefined;
				undismissedChangeIds?: Array<number> | undefined;
		  }
		| undefined {
		const history = this.histories.get(draftId);

		if (!history || history.currentIndex <= 0) {
			return;
		}

		// Get the revision we're undoing (the current one before decrementing)
		const undoneRevision = history.revisions[history.currentIndex];

		history.currentIndex--;
		return {
			content: history.revisions[history.currentIndex].content,
			undoneChangeIds: undoneRevision.appliedChangeIds,
			undismissedChangeIds: undoneRevision.dismissedChangeIds,
		};
	}

	/**
	 * Redoes the last undone change, returning the next content and the change IDs that were reapplied or redismissed
	 * Returns undefined if there's nothing to redo
	 */
	redo(draftId: number):
		| {
				content: string;
				reappliedChangeIds?: Array<number> | undefined;
				redismissedChangeIds?: Array<number> | undefined;
		  }
		| undefined {
		const history = this.histories.get(draftId);

		if (!history || history.currentIndex >= history.revisions.length - 1) {
			return;
		}

		history.currentIndex++;
		const redoneRevision = history.revisions[history.currentIndex];
		return {
			content: redoneRevision.content,
			reappliedChangeIds: redoneRevision.appliedChangeIds,
			redismissedChangeIds: redoneRevision.dismissedChangeIds,
		};
	}

	/**
	 * Checks if undo is available
	 */
	canUndo(draftId: number): boolean {
		const history = this.histories.get(draftId);
		return Boolean(history && history.currentIndex > 0);
	}

	/**
	 * Checks if redo is available
	 */
	canRedo(draftId: number): boolean {
		const history = this.histories.get(draftId);
		return Boolean(history && history.currentIndex < history.revisions.length - 1);
	}

	/**
	 * Gets the current content (at the current index)
	 */
	getCurrentContent(draftId: number): string | undefined {
		const history = this.histories.get(draftId);
		if (!history || history.currentIndex < 0) {
			return;
		}
		return history.revisions[history.currentIndex].content;
	}

	/**
	 * Gets revision metadata (without full content)
	 */
	getRevisionInfo(draftId: number): Array<Omit<Revision, "content">> | undefined {
		const history = this.histories.get(draftId);

		if (!history) {
			return;
		}

		return history.revisions.map(rev => ({
			timestamp: rev.timestamp,
			userId: rev.userId,
			description: rev.description,
			appliedChangeIds: rev.appliedChangeIds,
			dismissedChangeIds: rev.dismissedChangeIds,
		}));
	}

	/**
	 * Gets the current revision index
	 */
	getCurrentIndex(draftId: number): number {
		const history = this.histories.get(draftId);
		return history?.currentIndex ?? -1;
	}

	/**
	 * Gets the revision at a specific index
	 */
	getRevisionAt(draftId: number, index: number): Revision | undefined {
		const history = this.histories.get(draftId);
		if (!history || index < 0 || index >= history.revisions.length) {
			return;
		}
		return history.revisions[index];
	}

	/**
	 * Clears revision history for a draft (called when draft is saved or deleted)
	 */
	clear(draftId: number): void {
		this.histories.delete(draftId);
	}

	/**
	 * Clears all revision histories (useful for testing)
	 */
	clearAll(): void {
		this.histories.clear();
	}

	/**
	 * Gets the total number of revisions for a draft
	 */
	getRevisionCount(draftId: number): number {
		const history = this.histories.get(draftId);
		return history?.revisions.length ?? 0;
	}
}
