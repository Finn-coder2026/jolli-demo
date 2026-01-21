import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectScrollDownButton,
	SelectScrollUpButton,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "./Select";
import { describe, expect, it } from "vitest";

describe("Select", () => {
	it("should export Select components", () => {
		expect(Select).toBeDefined();
		expect(SelectGroup).toBeDefined();
		expect(SelectValue).toBeDefined();
		expect(SelectTrigger).toBeDefined();
		expect(SelectContent).toBeDefined();
		expect(SelectLabel).toBeDefined();
		expect(SelectItem).toBeDefined();
		expect(SelectSeparator).toBeDefined();
		expect(SelectScrollUpButton).toBeDefined();
		expect(SelectScrollDownButton).toBeDefined();
	});

	it("should have display names for forwardRef components", () => {
		expect(SelectTrigger.displayName).toBeDefined();
		expect(SelectScrollUpButton.displayName).toBeDefined();
		expect(SelectScrollDownButton.displayName).toBeDefined();
		expect(SelectContent.displayName).toBeDefined();
		expect(SelectLabel.displayName).toBeDefined();
		expect(SelectItem.displayName).toBeDefined();
		expect(SelectSeparator.displayName).toBeDefined();
	});

	it("should call SelectTrigger render function", () => {
		const renderFn = (SelectTrigger as unknown as { render: (props: unknown, ref: unknown) => unknown }).render;
		if (renderFn) {
			const element = renderFn({ className: "test" }, null);
			expect(element).toBeDefined();
		}
	});

	it("should call SelectScrollUpButton render function", () => {
		const renderFn = (SelectScrollUpButton as unknown as { render: (props: unknown, ref: unknown) => unknown })
			.render;
		if (renderFn) {
			const element = renderFn({ className: "test" }, null);
			expect(element).toBeDefined();
		}
	});

	it("should call SelectScrollDownButton render function", () => {
		const renderFn = (SelectScrollDownButton as unknown as { render: (props: unknown, ref: unknown) => unknown })
			.render;
		if (renderFn) {
			const element = renderFn({ className: "test" }, null);
			expect(element).toBeDefined();
		}
	});

	it("should call SelectContent render function with default position", () => {
		const renderFn = (SelectContent as unknown as { render: (props: unknown, ref: unknown) => unknown }).render;
		if (renderFn) {
			const element = renderFn({ className: "test", children: "content" }, null);
			expect(element).toBeDefined();
		}
	});

	it("should call SelectContent render function with popper position", () => {
		const renderFn = (SelectContent as unknown as { render: (props: unknown, ref: unknown) => unknown }).render;
		if (renderFn) {
			const element = renderFn({ className: "test", position: "popper", children: "content" }, null);
			expect(element).toBeDefined();
		}
	});

	it("should call SelectLabel render function", () => {
		const renderFn = (SelectLabel as unknown as { render: (props: unknown, ref: unknown) => unknown }).render;
		if (renderFn) {
			const element = renderFn({ className: "test" }, null);
			expect(element).toBeDefined();
		}
	});

	it("should call SelectItem render function", () => {
		const renderFn = (SelectItem as unknown as { render: (props: unknown, ref: unknown) => unknown }).render;
		if (renderFn) {
			const element = renderFn({ className: "test", children: "item", value: "1" }, null);
			expect(element).toBeDefined();
		}
	});

	it("should call SelectSeparator render function", () => {
		const renderFn = (SelectSeparator as unknown as { render: (props: unknown, ref: unknown) => unknown }).render;
		if (renderFn) {
			const element = renderFn({ className: "test" }, null);
			expect(element).toBeDefined();
		}
	});
});
