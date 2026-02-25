import { CodeBlockView } from "./CodeBlockView";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { ReactNodeViewProps } from "@tiptap/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cmdk", () => {
	const { forwardRef } = require("preact/compat");

	const MockCommand = forwardRef(({ className, ...props }: Record<string, unknown>, ref: unknown) => (
		<div ref={ref as never} className={className as string} {...props} />
	));

	const MockInput = forwardRef(({ className, ...props }: Record<string, unknown>, ref: unknown) => (
		<input ref={ref as never} className={className as string} {...props} />
	));

	const MockList = forwardRef(({ className, ...props }: Record<string, unknown>, ref: unknown) => (
		<div ref={ref as never} className={className as string} {...props} />
	));

	const MockEmpty = forwardRef((props: Record<string, unknown>, ref: unknown) => (
		<div ref={ref as never} {...props} />
	));

	const MockGroup = forwardRef(({ className, ...props }: Record<string, unknown>, ref: unknown) => (
		<div ref={ref as never} className={className as string} {...props} />
	));

	const MockItem = forwardRef(
		(
			{ className, onSelect, value, ...props }: Record<string, unknown> & { onSelect?: (v: string) => void },
			ref: unknown,
		) => (
			<div
				ref={ref as never}
				className={className as string}
				onClick={() => onSelect?.(value as string)}
				{...props}
			/>
		),
	);

	MockCommand.Input = MockInput;
	MockCommand.List = MockList;
	MockCommand.Empty = MockEmpty;
	MockCommand.Group = MockGroup;
	MockCommand.Item = MockItem;

	return { Command: MockCommand };
});

vi.mock("lucide-react", () => {
	const createMockIcon = (testId: string) => {
		const MockIcon = ({ className }: { className?: string }) => <div data-testid={testId} className={className} />;
		MockIcon.displayName = testId;
		return MockIcon;
	};

	return {
		Check: createMockIcon("check-icon"),
		ChevronDown: createMockIcon("chevron-down-icon"),
		Search: createMockIcon("search-icon"),
	};
});

vi.mock("react-intlayer", () => ({
	useIntlayer: vi.fn(() => ({
		codeBlock: {
			language: { value: "Language" },
			searchLanguage: { value: "Search language..." },
			noLanguageFound: { value: "No language found." },
		},
	})),
}));

vi.mock("@tiptap/react", () => ({
	NodeViewContent: (props: Record<string, unknown>) => <code data-testid="node-view-content" {...props} />,
	NodeViewWrapper: ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as never}</div>,
	ReactNodeViewRenderer: vi.fn(),
}));

function createMockNode(attrs: Record<string, unknown> = {}, textContent = "") {
	return {
		attrs: { language: "", ...attrs },
		textContent,
		nodeSize: 10,
	};
}

function renderCodeBlockView(props: Partial<ReactNodeViewProps> = {}) {
	const defaults = {
		node: createMockNode({ language: "javascript" }),
		editor: {},
		getPos: vi.fn(() => 0),
		updateAttributes: vi.fn(),
		decorations: [],
		selected: false,
		deleteNode: vi.fn(),
		view: {},
		HTMLAttributes: {},
		innerDecorations: [],
		extension: {},
	};
	const merged = { ...defaults, ...props } as unknown as ReactNodeViewProps;
	return render(<CodeBlockView {...merged} />);
}

describe("CodeBlockView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render code block with language selector", () => {
		renderCodeBlockView({ node: createMockNode({ language: "javascript" }, "const x = 1;") as never });
		expect(screen.getByTestId("code-block-view")).toBeTruthy();
		expect(screen.getByTestId("code-block-language-overlay")).toBeTruthy();
		expect(screen.getByTestId("code-block-language-selector")).toBeTruthy();
	});

	it("should render with data-language attribute", () => {
		renderCodeBlockView({ node: createMockNode({ language: "python" }) as never });
		expect(screen.getByTestId("code-block-view").getAttribute("data-language")).toBe("python");
	});

	it("should render NodeViewContent as code element", () => {
		renderCodeBlockView();
		expect(screen.getByTestId("node-view-content")).toBeTruthy();
	});

	it("should call updateAttributes when language is changed via selector", async () => {
		const updateAttributes = vi.fn();
		renderCodeBlockView({ updateAttributes: updateAttributes as never });

		fireEvent.click(screen.getByTestId("code-block-language-selector"));

		await waitFor(() => {
			expect(screen.getByTestId("language-option-python")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("language-option-python"));

		await waitFor(() => {
			expect(updateAttributes).toHaveBeenCalledWith({ language: "python" });
		});
	});

	it("should handle empty language attribute", () => {
		renderCodeBlockView({ node: createMockNode({}, "some code") as never });
		expect(screen.getByTestId("code-block-view").getAttribute("data-language")).toBe("");
	});

	it("should handle missing language attribute", () => {
		const node = { attrs: {}, textContent: "code", nodeSize: 10 };
		renderCodeBlockView({ node: node as never });
		expect(screen.getByTestId("code-block-view").getAttribute("data-language")).toBe("");
	});
});
