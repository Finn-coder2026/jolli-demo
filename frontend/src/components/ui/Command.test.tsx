import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./Command";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

vi.mock("cmdk", () => {
	const { forwardRef } = require("preact/compat");

	const MockCommand = forwardRef(({ className, ...props }: Record<string, unknown>, ref: unknown) => (
		<div ref={ref as never} className={className as string} {...props} data-testid-cmdk="command" />
	));
	MockCommand.displayName = "Command";

	const MockInput = forwardRef(({ className, ...props }: Record<string, unknown>, ref: unknown) => (
		<input ref={ref as never} className={className as string} {...props} data-testid-cmdk="input" />
	));
	MockInput.displayName = "CommandInput";

	const MockList = forwardRef(({ className, ...props }: Record<string, unknown>, ref: unknown) => (
		<div ref={ref as never} className={className as string} {...props} data-testid-cmdk="list" />
	));
	MockList.displayName = "CommandList";

	const MockEmpty = forwardRef((props: Record<string, unknown>, ref: unknown) => (
		<div ref={ref as never} {...props} data-testid-cmdk="empty" />
	));
	MockEmpty.displayName = "CommandEmpty";

	const MockGroup = forwardRef(({ className, ...props }: Record<string, unknown>, ref: unknown) => (
		<div ref={ref as never} className={className as string} {...props} data-testid-cmdk="group" />
	));
	MockGroup.displayName = "CommandGroup";

	const MockItem = forwardRef(({ className, ...props }: Record<string, unknown>, ref: unknown) => (
		<div ref={ref as never} className={className as string} {...props} data-testid-cmdk="item" />
	));
	MockItem.displayName = "CommandItem";

	MockCommand.Input = MockInput;
	MockCommand.List = MockList;
	MockCommand.Empty = MockEmpty;
	MockCommand.Group = MockGroup;
	MockCommand.Item = MockItem;

	return { Command: MockCommand };
});

vi.mock("lucide-react", () => ({
	Search: ({ className }: { className?: string }) => <div data-testid="search-icon" className={className} />,
}));

describe("Command", () => {
	it("should render Command wrapper", () => {
		render(
			<Command data-testid="cmd">
				<CommandList>
					<CommandEmpty>No results</CommandEmpty>
				</CommandList>
			</Command>,
		);
		expect(screen.getByTestId("cmd")).toBeTruthy();
	});

	it("should apply custom className to Command", () => {
		render(
			<Command data-testid="cmd" className="custom-class">
				<CommandList>
					<CommandEmpty>No results</CommandEmpty>
				</CommandList>
			</Command>,
		);
		expect(screen.getByTestId("cmd").className).toContain("custom-class");
	});

	it("should render CommandInput with search icon", () => {
		render(
			<Command>
				<CommandInput placeholder="Search..." data-testid="cmd-input" />
				<CommandList>
					<CommandEmpty>No results</CommandEmpty>
				</CommandList>
			</Command>,
		);
		expect(screen.getByTestId("command-input-wrapper")).toBeTruthy();
		expect(screen.getByTestId("search-icon")).toBeTruthy();
	});

	it("should apply custom className to CommandInput", () => {
		render(
			<Command>
				<CommandInput className="input-custom" data-testid="cmd-input" />
				<CommandList>
					<CommandEmpty>No results</CommandEmpty>
				</CommandList>
			</Command>,
		);
		expect(screen.getByTestId("cmd-input").className).toContain("input-custom");
	});

	it("should render CommandList", () => {
		render(
			<Command>
				<CommandList data-testid="cmd-list">
					<CommandEmpty>No results</CommandEmpty>
				</CommandList>
			</Command>,
		);
		expect(screen.getByTestId("cmd-list")).toBeTruthy();
	});

	it("should apply custom className to CommandList", () => {
		render(
			<Command>
				<CommandList data-testid="cmd-list" className="list-custom">
					<CommandEmpty>No results</CommandEmpty>
				</CommandList>
			</Command>,
		);
		expect(screen.getByTestId("cmd-list").className).toContain("list-custom");
	});

	it("should render CommandEmpty", () => {
		render(
			<Command>
				<CommandList>
					<CommandEmpty>No results found</CommandEmpty>
				</CommandList>
			</Command>,
		);
		expect(screen.getByText("No results found")).toBeTruthy();
	});

	it("should render CommandGroup", () => {
		render(
			<Command>
				<CommandList>
					<CommandGroup data-testid="cmd-group">
						<CommandItem>Item 1</CommandItem>
					</CommandGroup>
				</CommandList>
			</Command>,
		);
		expect(screen.getByTestId("cmd-group")).toBeTruthy();
	});

	it("should apply custom className to CommandGroup", () => {
		render(
			<Command>
				<CommandList>
					<CommandGroup data-testid="cmd-group" className="group-custom">
						<CommandItem>Item 1</CommandItem>
					</CommandGroup>
				</CommandList>
			</Command>,
		);
		expect(screen.getByTestId("cmd-group").className).toContain("group-custom");
	});

	it("should render CommandItem", () => {
		render(
			<Command>
				<CommandList>
					<CommandGroup>
						<CommandItem data-testid="cmd-item">Test Item</CommandItem>
					</CommandGroup>
				</CommandList>
			</Command>,
		);
		expect(screen.getByTestId("cmd-item")).toBeTruthy();
		expect(screen.getByText("Test Item")).toBeTruthy();
	});

	it("should apply custom className to CommandItem", () => {
		render(
			<Command>
				<CommandList>
					<CommandGroup>
						<CommandItem data-testid="cmd-item" className="item-custom">
							Test Item
						</CommandItem>
					</CommandGroup>
				</CommandList>
			</Command>,
		);
		expect(screen.getByTestId("cmd-item").className).toContain("item-custom");
	});
});
