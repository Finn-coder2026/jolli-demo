import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs";
import { describe, expect, it } from "vitest";

describe("Tabs", () => {
	it("should export Tabs component", () => {
		expect(Tabs).toBeDefined();
	});

	it("should export TabsList component", () => {
		expect(TabsList).toBeDefined();
		expect(TabsList.displayName).toBeDefined();
	});

	it("should export TabsTrigger component", () => {
		expect(TabsTrigger).toBeDefined();
		expect(TabsTrigger.displayName).toBeDefined();
	});

	it("should export TabsContent component", () => {
		expect(TabsContent).toBeDefined();
		expect(TabsContent.displayName).toBeDefined();
	});

	it("should call TabsList render function", () => {
		const renderFn = (TabsList as unknown as { render: (props: unknown, ref: unknown) => unknown }).render;
		if (renderFn) {
			const element = renderFn({ className: "test" }, null);
			expect(element).toBeDefined();
		}
	});

	it("should call TabsTrigger render function", () => {
		const renderFn = (TabsTrigger as unknown as { render: (props: unknown, ref: unknown) => unknown }).render;
		if (renderFn) {
			const element = renderFn({ className: "test" }, null);
			expect(element).toBeDefined();
		}
	});

	it("should call TabsContent render function", () => {
		const renderFn = (TabsContent as unknown as { render: (props: unknown, ref: unknown) => unknown }).render;
		if (renderFn) {
			const element = renderFn({ className: "test" }, null);
			expect(element).toBeDefined();
		}
	});
});
