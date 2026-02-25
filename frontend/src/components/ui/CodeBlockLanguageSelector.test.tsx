import { CodeBlockLanguageSelector } from "./CodeBlockLanguageSelector";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
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

describe("CodeBlockLanguageSelector", () => {
	let onLanguageChange: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		onLanguageChange = vi.fn();
	});

	it("should render with selected language label", () => {
		render(<CodeBlockLanguageSelector language="javascript" onLanguageChange={onLanguageChange} />);
		const trigger = screen.getByTestId("code-block-language-selector");
		expect(trigger).toBeTruthy();
		expect(trigger.textContent).toContain("JavaScript");
	});

	it("should show raw language value when not in predefined list", () => {
		render(<CodeBlockLanguageSelector language="unknown-lang" onLanguageChange={onLanguageChange} />);
		expect(screen.getByText("unknown-lang")).toBeTruthy();
	});

	it("should show fallback text when language is empty", () => {
		render(<CodeBlockLanguageSelector language="" onLanguageChange={onLanguageChange} />);
		expect(screen.getByText("Language")).toBeTruthy();
	});

	it("should open popover on click", async () => {
		render(<CodeBlockLanguageSelector language="javascript" onLanguageChange={onLanguageChange} />);
		fireEvent.click(screen.getByTestId("code-block-language-selector"));

		await waitFor(() => {
			expect(screen.getByTestId("code-block-language-search")).toBeTruthy();
		});
	});

	it("should render language options when open", async () => {
		render(<CodeBlockLanguageSelector language="javascript" onLanguageChange={onLanguageChange} />);
		fireEvent.click(screen.getByTestId("code-block-language-selector"));

		await waitFor(() => {
			expect(screen.getByTestId("language-option-python")).toBeTruthy();
			expect(screen.getByTestId("language-option-typescript")).toBeTruthy();
		});
	});

	it("should call onLanguageChange when a language is selected", async () => {
		render(<CodeBlockLanguageSelector language="javascript" onLanguageChange={onLanguageChange} />);
		fireEvent.click(screen.getByTestId("code-block-language-selector"));

		await waitFor(() => {
			expect(screen.getByTestId("language-option-python")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("language-option-python"));

		await waitFor(() => {
			expect(onLanguageChange).toHaveBeenCalledWith("python");
		});
	});

	it("should close popover after language selection", async () => {
		render(<CodeBlockLanguageSelector language="javascript" onLanguageChange={onLanguageChange} />);
		fireEvent.click(screen.getByTestId("code-block-language-selector"));

		await waitFor(() => {
			expect(screen.getByTestId("language-option-python")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("language-option-python"));

		await waitFor(() => {
			expect(onLanguageChange).toHaveBeenCalledWith("python");
		});
	});

	it("should show check icon for currently selected language", async () => {
		render(<CodeBlockLanguageSelector language="python" onLanguageChange={onLanguageChange} />);
		fireEvent.click(screen.getByTestId("code-block-language-selector"));

		await waitFor(() => {
			const selectedOption = screen.getByTestId("language-option-python");
			const unselectedOption = screen.getByTestId("language-option-javascript");
			expect(within(selectedOption).getByTestId("check-icon").className).toContain("opacity-100");
			expect(within(unselectedOption).getByTestId("check-icon").className).toContain("opacity-0");
		});
	});

	it("should have combobox role and aria-expanded attribute", () => {
		render(<CodeBlockLanguageSelector language="javascript" onLanguageChange={onLanguageChange} />);
		const trigger = screen.getByTestId("code-block-language-selector");
		expect(trigger.getAttribute("role")).toBe("combobox");
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
	});

	it("should handle null-ish language by falling back to empty string", () => {
		render(<CodeBlockLanguageSelector language={null as unknown as string} onLanguageChange={onLanguageChange} />);
		const trigger = screen.getByTestId("code-block-language-selector");
		expect(trigger.textContent).toContain("Language");
	});

	it("should show fallback placeholders when i18n codeBlock keys are missing", async () => {
		const { useIntlayer } = await import("react-intlayer");
		vi.mocked(useIntlayer).mockReturnValueOnce({
			codeBlock: undefined,
		} as never);

		render(<CodeBlockLanguageSelector language="javascript" onLanguageChange={onLanguageChange} />);
		fireEvent.click(screen.getByTestId("code-block-language-selector"));

		await waitFor(() => {
			expect(screen.getByTestId("code-block-language-search")).toBeTruthy();
		});
	});
});
