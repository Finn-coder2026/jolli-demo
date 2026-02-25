import { computeDiffOps } from "./LcsDiff";

interface MergeEdit {
	start: number;
	end: number;
	lines: Array<string>;
}

function computeEdits(baseLines: Array<string>, otherLines: Array<string>): Array<MergeEdit> {
	const ops = computeDiffOps(baseLines, otherLines);
	const edits: Array<MergeEdit> = [];
	let baseIndex = 0;
	let current: { start: number; lines: Array<string> } | null = null;

	for (const op of ops) {
		if (op.type === "equal") {
			if (current) {
				edits.push({ start: current.start, end: baseIndex, lines: current.lines });
				current = null;
			}
			baseIndex++;
			continue;
		}

		if (!current) {
			current = { start: baseIndex, lines: [] };
		}

		if (op.type === "delete") {
			baseIndex++;
		} else {
			current.lines.push(op.line);
		}
	}

	if (current) {
		edits.push({ start: current.start, end: baseIndex, lines: current.lines });
	}

	return edits;
}

function editsOverlap(a: MergeEdit, b: MergeEdit): boolean {
	const aInsert = a.start === a.end;
	const bInsert = b.start === b.end;

	if (aInsert && bInsert) {
		return a.start === b.start;
	}
	if (aInsert) {
		return a.start > b.start && a.start < b.end;
	}
	if (bInsert) {
		return b.start > a.start && b.start < a.end;
	}
	return a.start < b.end && b.start < a.end;
}

function editOverlapsRange(edit: MergeEdit, rangeStart: number, rangeEnd: number): boolean {
	if (rangeStart === rangeEnd) {
		return edit.start === edit.end && edit.start === rangeStart;
	}
	if (edit.start === edit.end) {
		return edit.start > rangeStart && edit.start < rangeEnd;
	}
	return edit.start < rangeEnd && edit.end > rangeStart;
}

function renderFragment(baseLines: Array<string>, edits: Array<MergeEdit>, start: number, end: number): Array<string> {
	const result: Array<string> = [];
	let cursor = start;

	for (const edit of edits) {
		if (edit.start > cursor) {
			result.push(...baseLines.slice(cursor, Math.min(edit.start, end)));
		}
		result.push(...edit.lines);
		cursor = Math.max(cursor, edit.end);
	}

	if (cursor < end) {
		result.push(...baseLines.slice(cursor, end));
	}

	return result;
}

function linesEqual(a: Array<string>, b: Array<string>): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}

type MergeContext = {
	baseLines: Array<string>;
	currentEdits: Array<MergeEdit>;
	incomingEdits: Array<MergeEdit>;
	result: Array<string>;
	idxCurrent: number;
	idxIncoming: number;
	cursor: number;
	hasConflict: boolean;
	currentLabel: string;
	incomingLabel: string;
};

function pushConflictMarkers(ctx: MergeContext, currentLines: Array<string>, incomingLines: Array<string>): void {
	ctx.result.push(`<<<<<<< ${ctx.currentLabel}`);
	if (currentLines.length > 0) {
		ctx.result.push(...currentLines);
	}
	ctx.result.push("=======");
	if (incomingLines.length > 0) {
		ctx.result.push(...incomingLines);
	}
	ctx.result.push(`>>>>>>> ${ctx.incomingLabel}`);
	ctx.hasConflict = true;
}

function expandOverlappingEdits(
	ctx: MergeContext,
	currentOverlap: Array<MergeEdit>,
	incomingOverlap: Array<MergeEdit>,
	unionStart: number,
	unionEnd: number,
): number {
	let currentUnionEnd = unionEnd;
	let expanded = true;

	while (expanded) {
		expanded = false;
		let currentEdit = ctx.currentEdits[ctx.idxCurrent];
		while (currentEdit !== undefined && editOverlapsRange(currentEdit, unionStart, currentUnionEnd)) {
			currentOverlap.push(currentEdit);
			currentUnionEnd = Math.max(currentUnionEnd, currentEdit.end);
			ctx.idxCurrent++;
			expanded = true;
			currentEdit = ctx.currentEdits[ctx.idxCurrent];
		}
		let incomingEdit = ctx.incomingEdits[ctx.idxIncoming];
		while (incomingEdit !== undefined && editOverlapsRange(incomingEdit, unionStart, currentUnionEnd)) {
			incomingOverlap.push(incomingEdit);
			currentUnionEnd = Math.max(currentUnionEnd, incomingEdit.end);
			ctx.idxIncoming++;
			expanded = true;
			incomingEdit = ctx.incomingEdits[ctx.idxIncoming];
		}
	}

	return currentUnionEnd;
}

function handleOverlappingEdits(ctx: MergeContext, nextCurrent: MergeEdit, nextIncoming: MergeEdit): void {
	const unionStart = Math.min(nextCurrent.start, nextIncoming.start);
	const initialUnionEnd = Math.max(nextCurrent.end, nextIncoming.end);
	const currentOverlap: Array<MergeEdit> = [nextCurrent];
	const incomingOverlap: Array<MergeEdit> = [nextIncoming];
	ctx.idxCurrent++;
	ctx.idxIncoming++;

	const unionEnd = expandOverlappingEdits(ctx, currentOverlap, incomingOverlap, unionStart, initialUnionEnd);

	const currentFragment = renderFragment(ctx.baseLines, currentOverlap, unionStart, unionEnd);
	const incomingFragment = renderFragment(ctx.baseLines, incomingOverlap, unionStart, unionEnd);

	if (linesEqual(currentFragment, incomingFragment)) {
		ctx.result.push(...currentFragment);
	} else {
		pushConflictMarkers(ctx, currentFragment, incomingFragment);
	}
	ctx.cursor = unionEnd;
}

function handleNonOverlappingEdit(
	ctx: MergeContext,
	nextCurrent: MergeEdit | undefined,
	nextIncoming: MergeEdit | undefined,
): void {
	const chooseCurrent =
		nextCurrent &&
		(!nextIncoming ||
			nextCurrent.start < nextIncoming.start ||
			(nextCurrent.start === nextIncoming.start && nextCurrent.start === nextCurrent.end));

	const edit = chooseCurrent ? nextCurrent : nextIncoming;
	/* v8 ignore next 3 -- defensive guard: caller guarantees at least one edit exists */
	if (!edit) {
		return;
	}

	/* v8 ignore next 4 -- defensive guard: main loop gap-fill ensures cursor === edit.start */
	if (edit.start > ctx.cursor) {
		ctx.result.push(...ctx.baseLines.slice(ctx.cursor, edit.start));
		ctx.cursor = edit.start;
	}

	ctx.result.push(...edit.lines);
	ctx.cursor = edit.end;

	if (chooseCurrent) {
		ctx.idxCurrent++;
	} else {
		ctx.idxIncoming++;
	}
}

/**
 * Performs a 3-way merge between base, current, and incoming content.
 * Returns merged content with conflict markers if conflicts exist.
 */
export function threeWayMerge(
	baseContent: string,
	currentContent: string,
	incomingContent: string,
	currentLabel = "CURRENT",
	incomingLabel = "INCOMING",
): { merged: string; hasConflict: boolean } {
	if (currentContent === incomingContent) {
		return { merged: currentContent, hasConflict: false };
	}
	if (baseContent === currentContent) {
		return { merged: incomingContent, hasConflict: false };
	}
	if (baseContent === incomingContent) {
		return { merged: currentContent, hasConflict: false };
	}

	const baseLines = baseContent.split("\n");
	const ctx: MergeContext = {
		baseLines,
		currentEdits: computeEdits(baseLines, currentContent.split("\n")),
		incomingEdits: computeEdits(baseLines, incomingContent.split("\n")),
		result: [],
		idxCurrent: 0,
		idxIncoming: 0,
		cursor: 0,
		hasConflict: false,
		currentLabel,
		incomingLabel,
	};

	while (ctx.idxCurrent < ctx.currentEdits.length || ctx.idxIncoming < ctx.incomingEdits.length) {
		const nextCurrent = ctx.currentEdits[ctx.idxCurrent];
		const nextIncoming = ctx.incomingEdits[ctx.idxIncoming];
		const nextStart = Math.min(
			nextCurrent ? nextCurrent.start : ctx.baseLines.length,
			nextIncoming ? nextIncoming.start : ctx.baseLines.length,
		);

		if (ctx.cursor < nextStart) {
			ctx.result.push(...ctx.baseLines.slice(ctx.cursor, nextStart));
			ctx.cursor = nextStart;
			continue;
		}

		if (nextCurrent && nextIncoming && editsOverlap(nextCurrent, nextIncoming)) {
			handleOverlappingEdits(ctx, nextCurrent, nextIncoming);
		} else {
			handleNonOverlappingEdit(ctx, nextCurrent, nextIncoming);
		}
	}

	if (ctx.cursor < ctx.baseLines.length) {
		ctx.result.push(...ctx.baseLines.slice(ctx.cursor));
	}

	return { merged: ctx.result.join("\n"), hasConflict: ctx.hasConflict };
}
