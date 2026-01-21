import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "./DropdownMenu";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("DropdownMenu", () => {
	it("should render dropdown menu with trigger and content", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
				<DropdownMenuContent data-testid="content">
					<DropdownMenuItem>Item 1</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("trigger")).toBeDefined();
	});

	it("should render DropdownMenuItem", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem data-testid="menu-item">Action</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("menu-item")).toBeDefined();
		expect(screen.getByText("Action")).toBeDefined();
	});

	it("should render DropdownMenuItem with inset prop", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem inset data-testid="inset-item">
						Inset Action
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("inset-item")).toBeDefined();
	});

	it("should render DropdownMenuItem with custom className", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem className="custom-class" data-testid="custom-item">
						Custom
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		const item = screen.getByTestId("custom-item");
		expect(item.className).toContain("custom-class");
	});

	it("should render DropdownMenuCheckboxItem", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuCheckboxItem data-testid="checkbox-item">Checkbox Option</DropdownMenuCheckboxItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("checkbox-item")).toBeDefined();
		expect(screen.getByText("Checkbox Option")).toBeDefined();
	});

	it("should render DropdownMenuCheckboxItem with checked state", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuCheckboxItem checked={true} data-testid="checked-item">
						Checked
					</DropdownMenuCheckboxItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("checked-item")).toBeDefined();
	});

	it("should render DropdownMenuCheckboxItem with unchecked state", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuCheckboxItem checked={false} data-testid="unchecked-item">
						Unchecked
					</DropdownMenuCheckboxItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("unchecked-item")).toBeDefined();
	});

	it("should render DropdownMenuCheckboxItem without checked prop", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuCheckboxItem data-testid="no-checked-item">No Checked Prop</DropdownMenuCheckboxItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("no-checked-item")).toBeDefined();
	});

	it("should render DropdownMenuRadioGroup with DropdownMenuRadioItem", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuRadioGroup value="option1">
						<DropdownMenuRadioItem value="option1" data-testid="radio-item-1">
							Option 1
						</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="option2" data-testid="radio-item-2">
							Option 2
						</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("radio-item-1")).toBeDefined();
		expect(screen.getByTestId("radio-item-2")).toBeDefined();
		expect(screen.getByText("Option 1")).toBeDefined();
		expect(screen.getByText("Option 2")).toBeDefined();
	});

	it("should render DropdownMenuLabel", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuLabel data-testid="label">Actions</DropdownMenuLabel>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("label")).toBeDefined();
		expect(screen.getByText("Actions")).toBeDefined();
	});

	it("should render DropdownMenuLabel with inset prop", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuLabel inset data-testid="inset-label">
						Inset Label
					</DropdownMenuLabel>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("inset-label")).toBeDefined();
	});

	it("should render DropdownMenuSeparator", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem>Item 1</DropdownMenuItem>
					<DropdownMenuSeparator data-testid="separator" />
					<DropdownMenuItem>Item 2</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("separator")).toBeDefined();
	});

	it("should render DropdownMenuShortcut", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem>
						<span>Save</span>
						<DropdownMenuShortcut data-testid="shortcut">⌘S</DropdownMenuShortcut>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("shortcut")).toBeDefined();
		expect(screen.getByText("⌘S")).toBeDefined();
	});

	it("should render DropdownMenuShortcut with custom className", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem>
						<span>Copy</span>
						<DropdownMenuShortcut className="custom-shortcut" data-testid="custom-shortcut">
							⌘C
						</DropdownMenuShortcut>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		const shortcut = screen.getByTestId("custom-shortcut");
		expect(shortcut.className).toContain("custom-shortcut");
	});

	it("should render DropdownMenuGroup", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuGroup data-testid="group">
						<DropdownMenuItem>Group Item 1</DropdownMenuItem>
						<DropdownMenuItem>Group Item 2</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("group")).toBeDefined();
	});

	it("should render nested submenu", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger data-testid="sub-trigger">More Options</DropdownMenuSubTrigger>
						<DropdownMenuSubContent data-testid="sub-content">
							<DropdownMenuItem>Sub Item 1</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("sub-trigger")).toBeDefined();
		expect(screen.getByText("More Options")).toBeDefined();
	});

	it("should render DropdownMenuSubTrigger with inset prop", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger inset data-testid="inset-sub-trigger">
							Inset Submenu
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuItem>Sub Item</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("inset-sub-trigger")).toBeDefined();
	});

	it("should render DropdownMenuContent with custom sideOffset", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent sideOffset={8} data-testid="custom-offset-content">
					<DropdownMenuItem>Item</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("custom-offset-content")).toBeDefined();
	});

	it("should render DropdownMenuContent with default sideOffset", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open</DropdownMenuTrigger>
				<DropdownMenuContent data-testid="default-offset-content">
					<DropdownMenuItem>Item</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("default-offset-content")).toBeDefined();
	});

	it("should render complex dropdown menu structure", () => {
		render(
			<DropdownMenu>
				<DropdownMenuTrigger data-testid="complex-trigger">Menu</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuLabel>My Account</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem>Profile</DropdownMenuItem>
						<DropdownMenuItem>Settings</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuCheckboxItem checked={true}>Notifications</DropdownMenuCheckboxItem>
					<DropdownMenuSeparator />
					<DropdownMenuRadioGroup value="light">
						<DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("complex-trigger")).toBeDefined();
		expect(screen.getByText("My Account")).toBeDefined();
		expect(screen.getByText("Profile")).toBeDefined();
		expect(screen.getByText("Settings")).toBeDefined();
		expect(screen.getByText("Notifications")).toBeDefined();
		expect(screen.getByText("Light")).toBeDefined();
		expect(screen.getByText("Dark")).toBeDefined();
	});
});
