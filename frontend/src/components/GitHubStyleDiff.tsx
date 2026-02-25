import styles from "./GitHubStyleDiff.module.css";
import type { ReactElement } from "react";
import { useMemo } from "react";

export type DiffViewMode = "line-by-line" | "side-by-side";

export interface GitHubStyleDiffProps {
	oldContent: string;
	newContent: string;
	className?: string;
	testId?: string;
	/** Display mode for the diff. Defaults to "line-by-line". */
	viewMode?: DiffViewMode;
}

interface DiffLine {
	type: "added" | "removed" | "unchanged";
	content: string;
	oldLineNum: number | null;
	newLineNum: number | null;
}

interface SideBySideRow {
	oldLineNum: number | null;
	oldContent: string | null;
	oldType: "removed" | "unchanged" | null;
	newLineNum: number | null;
	newContent: string | null;
	newType: "added" | "unchanged" | null;
}

function computeLCS(oldLines: Array<string>, newLines: Array<string>): Array<[number, number]> {
	const m = oldLines.length;
	const n = newLines.length;

	const dp: Array<Array<number>> = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (oldLines[i - 1] === newLines[j - 1]) {
				dp[i][j] = dp[i - 1][j - 1] + 1;
			} else {
				dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
			}
		}
	}

	const lcs: Array<[number, number]> = [];
	let i = m;
	let j = n;

	while (i > 0 && j > 0) {
		if (oldLines[i - 1] === newLines[j - 1]) {
			lcs.unshift([i - 1, j - 1]);
			i--;
			j--;
		} else if (dp[i - 1][j] > dp[i][j - 1]) {
			i--;
		} else {
			j--;
		}
	}

	return lcs;
}

function generateDiffLines(oldContent: string, newContent: string): Array<DiffLine> {
	const oldLines = oldContent ? oldContent.split("\n") : [];
	const newLines = newContent ? newContent.split("\n") : [];
	const lcs = computeLCS(oldLines, newLines);
	const result: Array<DiffLine> = [];

	let oldIdx = 0;
	let newIdx = 0;
	let oldLineNum = 1;
	let newLineNum = 1;

	for (const [oldLcsIdx, newLcsIdx] of lcs) {
		while (oldIdx < oldLcsIdx) {
			result.push({
				type: "removed",
				content: oldLines[oldIdx],
				oldLineNum: oldLineNum++,
				newLineNum: null,
			});
			oldIdx++;
		}

		while (newIdx < newLcsIdx) {
			result.push({
				type: "added",
				content: newLines[newIdx],
				oldLineNum: null,
				newLineNum: newLineNum++,
			});
			newIdx++;
		}

		result.push({
			type: "unchanged",
			content: oldLines[oldIdx],
			oldLineNum: oldLineNum++,
			newLineNum: newLineNum++,
		});
		oldIdx++;
		newIdx++;
	}

	while (oldIdx < oldLines.length) {
		result.push({
			type: "removed",
			content: oldLines[oldIdx],
			oldLineNum: oldLineNum++,
			newLineNum: null,
		});
		oldIdx++;
	}

	while (newIdx < newLines.length) {
		result.push({
			type: "added",
			content: newLines[newIdx],
			oldLineNum: null,
			newLineNum: newLineNum++,
		});
		newIdx++;
	}

	return result;
}

function normalizeContent(text: string): string {
	return text
		.split("\n")
		.map(line => line.trimEnd())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function createUnchangedRow(line: DiffLine): SideBySideRow {
	return {
		oldLineNum: line.oldLineNum,
		oldContent: line.content,
		oldType: "unchanged",
		newLineNum: line.newLineNum,
		newContent: line.content,
		newType: "unchanged",
	};
}

function createAddedOnlyRow(line: DiffLine): SideBySideRow {
	return {
		oldLineNum: null,
		oldContent: null,
		oldType: null,
		newLineNum: line.newLineNum,
		newContent: line.content,
		newType: "added",
	};
}

function collectConsecutiveLines(
	diffLines: Array<DiffLine>,
	startIdx: number,
	type: DiffLine["type"],
): Array<DiffLine> {
	const collected: Array<DiffLine> = [];
	let idx = startIdx;
	while (idx < diffLines.length && diffLines[idx].type === type) {
		collected.push(diffLines[idx]);
		idx++;
	}
	return collected;
}

function pairRemovedAndAdded(removedLines: Array<DiffLine>, addedLines: Array<DiffLine>): Array<SideBySideRow> {
	const paired: Array<SideBySideRow> = [];
	const maxLen = Math.max(removedLines.length, addedLines.length);
	for (let j = 0; j < maxLen; j++) {
		const removed = j < removedLines.length ? removedLines[j] : null;
		const added = j < addedLines.length ? addedLines[j] : null;
		paired.push({
			oldLineNum: removed?.oldLineNum ?? null,
			oldContent: removed?.content ?? null,
			oldType: removed ? "removed" : null,
			newLineNum: added?.newLineNum ?? null,
			newContent: added?.content ?? null,
			newType: added ? "added" : null,
		});
	}
	return paired;
}

function generateSideBySideRows(diffLines: Array<DiffLine>): Array<SideBySideRow> {
	const rows: Array<SideBySideRow> = [];
	let i = 0;

	while (i < diffLines.length) {
		const line = diffLines[i];

		if (line.type === "unchanged") {
			rows.push(createUnchangedRow(line));
			i++;
		} else if (line.type === "removed") {
			const removedLines = collectConsecutiveLines(diffLines, i, "removed");
			i += removedLines.length;
			const addedLines = collectConsecutiveLines(diffLines, i, "added");
			i += addedLines.length;
			rows.push(...pairRemovedAndAdded(removedLines, addedLines));
		} else {
			rows.push(createAddedOnlyRow(line));
			i++;
		}
	}

	return rows;
}

const CELL_CLASS_MAP: Record<DiffLine["type"], string> = {
	removed: styles.removedCell,
	added: styles.addedCell,
	unchanged: styles.unchangedCell,
};

function getCellClassName(type: "removed" | "unchanged" | "added" | null): string {
	return (type && CELL_CLASS_MAP[type]) || styles.emptyCell;
}

export function GitHubStyleDiff({
	oldContent,
	newContent,
	className,
	testId = "github-diff",
	viewMode = "line-by-line",
}: GitHubStyleDiffProps): ReactElement {
	const diffLines = useMemo(() => {
		const normalizedOld = normalizeContent(oldContent);
		const normalizedNew = normalizeContent(newContent);

		if (normalizedOld === normalizedNew) {
			return [];
		}

		return generateDiffLines(normalizedOld, normalizedNew);
	}, [oldContent, newContent]);

	const sideBySideRows = useMemo(() => {
		if (viewMode !== "side-by-side" || diffLines.length === 0) {
			return [];
		}
		return generateSideBySideRows(diffLines);
	}, [diffLines, viewMode]);

	if (diffLines.length === 0) {
		return (
			<div className={className} data-testid={testId}>
				<p className={styles.noChanges} data-testid={`${testId}-no-changes`}>
					No changes
				</p>
			</div>
		);
	}

	if (viewMode === "side-by-side") {
		return (
			<div
				className={`${styles.diffContainer} ${styles.sideBySideContainer} ${className ?? ""}`}
				data-testid={testId}
			>
				<table className={`${styles.diffTable} ${styles.sideBySideTable}`}>
					<tbody>
						{sideBySideRows.map((row, idx) => (
							<tr key={idx} className={styles.diffRow} data-testid={`${testId}-line-${idx}`}>
								<td className={`${styles.lineNum} ${getCellClassName(row.oldType)}`}>
									{row.oldLineNum ?? ""}
								</td>
								<td className={`${styles.linePrefix} ${getCellClassName(row.oldType)}`}>
									{row.oldType === "removed" ? "-" : row.oldType === "unchanged" ? " " : ""}
								</td>
								<td className={`${styles.sideBySideContent} ${getCellClassName(row.oldType)}`}>
									<span className={styles.lineText}>
										{row.oldContent != null ? row.oldContent || " " : ""}
									</span>
								</td>
								<td
									className={`${styles.lineNum} ${styles.sideBySideDivider} ${getCellClassName(row.newType)}`}
								>
									{row.newLineNum ?? ""}
								</td>
								<td className={`${styles.linePrefix} ${getCellClassName(row.newType)}`}>
									{row.newType === "added" ? "+" : row.newType === "unchanged" ? " " : ""}
								</td>
								<td className={`${styles.sideBySideContent} ${getCellClassName(row.newType)}`}>
									<span className={styles.lineText}>
										{row.newContent != null ? row.newContent || " " : ""}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		);
	}

	return (
		<div className={`${styles.diffContainer} ${className ?? ""}`} data-testid={testId}>
			<table className={styles.diffTable}>
				<tbody>
					{diffLines.map((line, idx) => (
						<tr
							key={idx}
							className={`${styles.diffRow} ${
								line.type === "added"
									? styles.addedRow
									: line.type === "removed"
										? styles.removedRow
										: styles.unchangedRow
							}`}
							data-testid={`${testId}-line-${idx}`}
						>
							<td className={`${styles.lineNum} ${styles.oldLineNum}`}>{line.oldLineNum ?? ""}</td>
							<td className={`${styles.lineNum} ${styles.newLineNum}`}>{line.newLineNum ?? ""}</td>
							<td className={styles.linePrefix}>
								{line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
							</td>
							<td className={styles.lineContent}>
								<span className={styles.lineText}>{line.content || " "}</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
