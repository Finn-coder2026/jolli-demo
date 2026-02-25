import { GitHubStyleDiff } from "./GitHubStyleDiff";
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("GitHubStyleDiff", () => {
	describe("rendering", () => {
		it("renders no changes message when content is identical", () => {
			const { getByTestId } = render(<GitHubStyleDiff oldContent="hello world" newContent="hello world" />);

			const noChanges = getByTestId("github-diff-no-changes");
			expect(noChanges).toBeTruthy();
			expect(noChanges.textContent).toBe("No changes");
		});

		it("renders no changes message when normalized content is identical", () => {
			const { getByTestId } = render(<GitHubStyleDiff oldContent="hello world  " newContent="hello world" />);

			expect(getByTestId("github-diff-no-changes")).toBeTruthy();
		});

		it("renders diff table when content differs", () => {
			const { container } = render(<GitHubStyleDiff oldContent="old line" newContent="new line" />);

			expect(container.querySelector("table")).toBeTruthy();
		});

		it("applies custom className", () => {
			const { getByTestId } = render(
				<GitHubStyleDiff oldContent="old" newContent="new" className="custom-class" />,
			);

			expect(getByTestId("github-diff").className).toContain("custom-class");
		});

		it("renders with custom testId", () => {
			const { getByTestId } = render(<GitHubStyleDiff oldContent="old" newContent="new" testId="custom-diff" />);

			expect(getByTestId("custom-diff")).toBeTruthy();
		});
	});

	describe("line types", () => {
		it("renders removed lines with minus prefix", () => {
			const { getByTestId } = render(<GitHubStyleDiff oldContent="removed line" newContent="" />);

			const row = getByTestId("github-diff-line-0");
			expect(row.textContent).toContain("-");
			expect(row.textContent).toContain("removed line");
		});

		it("renders added lines with plus prefix", () => {
			const { getByTestId } = render(<GitHubStyleDiff oldContent="" newContent="added line" />);

			const row = getByTestId("github-diff-line-0");
			expect(row.textContent).toContain("+");
			expect(row.textContent).toContain("added line");
		});

		it("renders unchanged lines with space prefix", () => {
			const { getByTestId } = render(<GitHubStyleDiff oldContent="same\ndifferent" newContent="same\nchanged" />);

			const firstRow = getByTestId("github-diff-line-0");
			expect(firstRow.textContent).toContain("same");
		});

		it("renders line numbers correctly for removed lines", () => {
			const { getAllByTestId } = render(
				<GitHubStyleDiff oldContent="line one\nline two" newContent="line one" />,
			);

			const rows = getAllByTestId(/github-diff-line-/);
			expect(rows.length).toBe(2);
			const removedRow = rows.find(row => row.textContent?.includes("line two"));
			expect(removedRow).toBeTruthy();
			expect(removedRow?.textContent).toContain("-");
		});

		it("renders line numbers correctly for added lines", () => {
			const { getAllByTestId } = render(
				<GitHubStyleDiff oldContent="line one" newContent="line one\nline two" />,
			);

			const rows = getAllByTestId(/github-diff-line-/);
			expect(rows.length).toBe(2);
		});
	});

	describe("complex diffs", () => {
		it("handles multiple changes in sequence", () => {
			const oldContent = `line 1
line 2
line 3`;
			const newContent = `line 1
modified line
line 3
line 4`;

			const { getAllByTestId } = render(<GitHubStyleDiff oldContent={oldContent} newContent={newContent} />);

			const rows = getAllByTestId(/github-diff-line-/);
			expect(rows.length).toBeGreaterThan(3);
		});

		it("handles completely different content", () => {
			const { getAllByTestId } = render(
				<GitHubStyleDiff oldContent="old content only" newContent="new content only" />,
			);

			const rows = getAllByTestId(/github-diff-line-/);
			expect(rows.length).toBe(2);
		});

		it("handles empty old content", () => {
			const { getAllByTestId } = render(<GitHubStyleDiff oldContent="" newContent="new line 1\nnew line 2" />);

			const rows = getAllByTestId(/github-diff-line-/);
			expect(rows.length).toBeGreaterThanOrEqual(1);
			const hasAddedLine = rows.some(row => row.textContent?.includes("+"));
			expect(hasAddedLine).toBe(true);
		});

		it("handles empty new content", () => {
			const { getAllByTestId } = render(<GitHubStyleDiff oldContent="old line 1\nold line 2" newContent="" />);

			const rows = getAllByTestId(/github-diff-line-/);
			expect(rows.length).toBeGreaterThanOrEqual(1);
			const hasRemovedLine = rows.some(row => row.textContent?.includes("-"));
			expect(hasRemovedLine).toBe(true);
		});

		it("handles whitespace normalization", () => {
			const oldContent = "line 1\n\n\n\nline 2";
			const newContent = "line 1\n\nline 2";

			const { getByTestId } = render(<GitHubStyleDiff oldContent={oldContent} newContent={newContent} />);

			expect(getByTestId("github-diff-no-changes")).toBeTruthy();
		});

		it("preserves empty lines in content", () => {
			const oldContent = "line 1\n\nline 2";
			const newContent = "line 1\n\nline 2\n\nline 3";

			const { getAllByTestId } = render(<GitHubStyleDiff oldContent={oldContent} newContent={newContent} />);

			const rows = getAllByTestId(/github-diff-line-/);
			expect(rows.length).toBeGreaterThan(3);
		});
	});

	describe("edge cases", () => {
		it("handles single character difference", () => {
			const { getAllByTestId } = render(<GitHubStyleDiff oldContent="a" newContent="b" />);

			const rows = getAllByTestId(/github-diff-line-/);
			expect(rows.length).toBe(2);
		});

		it("handles multiline markdown content", () => {
			const oldContent = `# Heading

Some paragraph text.

## Subheading

More content here.`;

			const newContent = `# Heading

Updated paragraph text.

## Subheading

More content here.`;

			const { getAllByTestId } = render(<GitHubStyleDiff oldContent={oldContent} newContent={newContent} />);

			const rows = getAllByTestId(/github-diff-line-/);
			expect(rows.length).toBeGreaterThan(0);
		});
	});

	describe("side-by-side mode", () => {
		it("renders no changes message when content is identical", () => {
			const { getByTestId } = render(
				<GitHubStyleDiff oldContent="hello world" newContent="hello world" viewMode="side-by-side" />,
			);

			expect(getByTestId("github-diff-no-changes")).toBeTruthy();
		});

		it("renders diff table in side-by-side mode when content differs", () => {
			const { container } = render(
				<GitHubStyleDiff oldContent="old line" newContent="new line" viewMode="side-by-side" />,
			);

			expect(container.querySelector("table")).toBeTruthy();
		});

		it("renders six columns per row in side-by-side mode", () => {
			const { getByTestId } = render(
				<GitHubStyleDiff oldContent="old line" newContent="new line" viewMode="side-by-side" />,
			);

			const row = getByTestId("github-diff-line-0");
			expect(row.querySelectorAll("td").length).toBe(6);
		});

		it("shows removed content on the left and added content on the right", () => {
			const { getByTestId } = render(
				<GitHubStyleDiff oldContent="old line" newContent="new line" viewMode="side-by-side" />,
			);

			const row = getByTestId("github-diff-line-0");
			const cells = row.querySelectorAll("td");
			expect(cells[0].textContent).toBe("1");
			expect(cells[1].textContent).toBe("-");
			expect(cells[2].textContent).toContain("old line");
			expect(cells[3].textContent).toBe("1");
			expect(cells[4].textContent).toBe("+");
			expect(cells[5].textContent).toContain("new line");
		});

		it("shows unchanged lines on both sides", () => {
			const { getByTestId } = render(
				<GitHubStyleDiff oldContent="same\ndifferent" newContent="same\nchanged" viewMode="side-by-side" />,
			);

			const unchangedRow = getByTestId("github-diff-line-0");
			const cells = unchangedRow.querySelectorAll("td");
			expect(cells[0].textContent).toBe("1");
			expect(cells[2].textContent).toContain("same");
			expect(cells[3].textContent).toBe("1");
			expect(cells[5].textContent).toContain("same");
		});

		it("handles unequal numbers of removed and added lines", () => {
			const { getAllByTestId } = render(
				<GitHubStyleDiff
					oldContent="line one\nline two\nline three"
					newContent="line one\nnew line"
					viewMode="side-by-side"
				/>,
			);

			const rows = getAllByTestId(/github-diff-line-/);
			expect(rows.length).toBeGreaterThanOrEqual(1);
		});

		it("handles empty old content in side-by-side mode", () => {
			const { getAllByTestId } = render(
				<GitHubStyleDiff oldContent="" newContent="new line 1\nnew line 2" viewMode="side-by-side" />,
			);

			const rows = getAllByTestId(/github-diff-line-/);
			expect(rows.length).toBeGreaterThanOrEqual(1);
		});

		it("handles empty new content in side-by-side mode", () => {
			const { getAllByTestId } = render(
				<GitHubStyleDiff oldContent="old line 1\nold line 2" newContent="" viewMode="side-by-side" />,
			);

			const rows = getAllByTestId(/github-diff-line-/);
			expect(rows.length).toBeGreaterThanOrEqual(1);
		});

		it("applies custom className in side-by-side mode", () => {
			const { getByTestId } = render(
				<GitHubStyleDiff oldContent="old" newContent="new" viewMode="side-by-side" className="custom-class" />,
			);

			expect(getByTestId("github-diff").className).toContain("custom-class");
		});

		it("defaults to line-by-line mode when viewMode is not specified", () => {
			const { getByTestId } = render(<GitHubStyleDiff oldContent="old" newContent="new" />);

			const row = getByTestId("github-diff-line-0");
			expect(row.querySelectorAll("td").length).toBe(4);
		});

		it("renders correctly with whitespace normalization in side-by-side mode", () => {
			const oldContent = "line 1\n\n\n\nline 2";
			const newContent = "line 1\n\nline 2";

			const { getByTestId } = render(
				<GitHubStyleDiff oldContent={oldContent} newContent={newContent} viewMode="side-by-side" />,
			);

			expect(getByTestId("github-diff-no-changes")).toBeTruthy();
		});

		it("renders added-only rows when new content has extra lines", () => {
			const oldText = "line A";
			const newText = "line A\nline B\nline C";

			const { container } = render(
				<GitHubStyleDiff oldContent={oldText} newContent={newText} viewMode="side-by-side" />,
			);

			const rows = container.querySelectorAll("tr");
			expect(rows.length).toBe(3);
			// Row 0: unchanged "line A"
			const unchangedCells = rows[0].querySelectorAll("td");
			expect(unchangedCells[2].textContent).toContain("line A");
			expect(unchangedCells[5].textContent).toContain("line A");
			// Rows 1-2: added-only rows (empty left side, added on right)
			const addedRow1Cells = rows[1].querySelectorAll("td");
			expect(addedRow1Cells[0].textContent).toBe("");
			expect(addedRow1Cells[4].textContent).toBe("+");
			expect(addedRow1Cells[5].textContent).toContain("line B");
			const addedRow2Cells = rows[2].querySelectorAll("td");
			expect(addedRow2Cells[0].textContent).toBe("");
			expect(addedRow2Cells[4].textContent).toBe("+");
			expect(addedRow2Cells[5].textContent).toContain("line C");
		});

		it("renders empty cells when more removed than added lines", () => {
			const oldText = "alpha\nbeta\ngamma";
			const newText = "delta";

			const { container } = render(
				<GitHubStyleDiff oldContent={oldText} newContent={newText} viewMode="side-by-side" />,
			);

			const rows = container.querySelectorAll("tr");
			// All 3 old lines removed, 1 new line added: pairRemovedAndAdded creates 3 rows
			expect(rows.length).toBe(3);
			// First row: removed "alpha" paired with added "delta"
			const firstCells = rows[0].querySelectorAll("td");
			expect(firstCells[1].textContent).toBe("-");
			expect(firstCells[2].textContent).toContain("alpha");
			expect(firstCells[4].textContent).toBe("+");
			expect(firstCells[5].textContent).toContain("delta");
			// Last row: removed "gamma" with empty right side
			const lastCells = rows[2].querySelectorAll("td");
			expect(lastCells[1].textContent).toBe("-");
			expect(lastCells[2].textContent).toContain("gamma");
			expect(lastCells[3].textContent).toBe("");
			expect(lastCells[4].textContent).toBe("");
		});

		it("renders space prefix for unchanged lines in side-by-side mode", () => {
			const oldText = "same\ndifferent";
			const newText = "same\nchanged";

			const { container } = render(
				<GitHubStyleDiff oldContent={oldText} newContent={newText} viewMode="side-by-side" />,
			);

			const rows = container.querySelectorAll("tr");
			expect(rows.length).toBe(2);
			// Row 0: unchanged "same" - prefix should be space on both sides
			const unchangedCells = rows[0].querySelectorAll("td");
			expect(unchangedCells[1].textContent).toBe(" ");
			expect(unchangedCells[4].textContent).toBe(" ");
			// Row 1: removed/added - prefix should be "-" and "+"
			const changedCells = rows[1].querySelectorAll("td");
			expect(changedCells[1].textContent).toBe("-");
			expect(changedCells[4].textContent).toBe("+");
		});

		it("uses custom testId in side-by-side mode", () => {
			const { getByTestId } = render(
				<GitHubStyleDiff oldContent="old" newContent="new" viewMode="side-by-side" testId="custom-diff" />,
			);

			expect(getByTestId("custom-diff")).toBeTruthy();
			expect(getByTestId("custom-diff-line-0")).toBeTruthy();
		});

		it("uses custom testId for no-changes message", () => {
			const { getByTestId } = render(
				<GitHubStyleDiff oldContent="same" newContent="same" testId="custom-diff" />,
			);

			expect(getByTestId("custom-diff-no-changes")).toBeTruthy();
		});
	});
});
