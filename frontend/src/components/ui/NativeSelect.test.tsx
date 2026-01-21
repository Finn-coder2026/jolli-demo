import { NativeSelect } from "./NativeSelect";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

describe("NativeSelect", () => {
	it("should render a native select element", () => {
		render(
			<NativeSelect>
				<option value="1">Option 1</option>
				<option value="2">Option 2</option>
			</NativeSelect>,
		);

		const select = screen.getByRole("combobox");
		expect(select.tagName).toBe("SELECT");
	});

	it("should render options correctly", () => {
		render(
			<NativeSelect>
				<option value="1">Option 1</option>
				<option value="2">Option 2</option>
				<option value="3">Option 3</option>
			</NativeSelect>,
		);

		expect(screen.getByText("Option 1")).toBeDefined();
		expect(screen.getByText("Option 2")).toBeDefined();
		expect(screen.getByText("Option 3")).toBeDefined();
	});

	it("should handle value prop", () => {
		render(
			<NativeSelect value="2">
				<option value="1">Option 1</option>
				<option value="2">Option 2</option>
			</NativeSelect>,
		);

		const select = screen.getByRole("combobox") as HTMLSelectElement;
		expect(select.value).toBe("2");
	});

	it("should call onChange when selection changes", () => {
		const handleChange = vi.fn();

		render(
			<NativeSelect onChange={handleChange}>
				<option value="1">Option 1</option>
				<option value="2">Option 2</option>
			</NativeSelect>,
		);

		const select = screen.getByRole("combobox") as HTMLSelectElement;
		select.value = "2";
		select.dispatchEvent(new Event("change", { bubbles: true }));

		expect(handleChange).toHaveBeenCalled();
	});

	it("should be disabled when disabled prop is true", () => {
		render(
			<NativeSelect disabled>
				<option value="1">Option 1</option>
			</NativeSelect>,
		);

		const select = screen.getByRole("combobox") as HTMLSelectElement;
		expect(select.disabled).toBe(true);
	});

	it("should apply custom className", () => {
		render(
			<NativeSelect className="custom-class">
				<option value="1">Option 1</option>
			</NativeSelect>,
		);

		const select = screen.getByRole("combobox");
		expect(select.className).toContain("custom-class");
	});

	it("should forward ref correctly", () => {
		let selectRef: HTMLSelectElement | null = null;

		render(
			<NativeSelect
				ref={ref => {
					selectRef = ref;
				}}
			>
				<option value="1">Option 1</option>
			</NativeSelect>,
		);

		expect(selectRef).not.toBeNull();
		// biome-ignore lint/style/noNonNullAssertion: We just verified it's not null
		expect(selectRef!.tagName).toBe("SELECT");
	});

	it("should handle required attribute", () => {
		render(
			<NativeSelect required>
				<option value="1">Option 1</option>
			</NativeSelect>,
		);

		const select = screen.getByRole("combobox") as HTMLSelectElement;
		expect(select.required).toBe(true);
	});

	it("should handle name attribute", () => {
		render(
			<NativeSelect name="my-select">
				<option value="1">Option 1</option>
			</NativeSelect>,
		);

		const select = screen.getByRole("combobox") as HTMLSelectElement;
		expect(select.name).toBe("my-select");
	});

	it("should handle multiple attribute", () => {
		render(
			<NativeSelect multiple>
				<option value="1">Option 1</option>
				<option value="2">Option 2</option>
			</NativeSelect>,
		);

		const select = screen.getByRole("listbox") as HTMLSelectElement;
		expect(select.multiple).toBe(true);
	});
});
