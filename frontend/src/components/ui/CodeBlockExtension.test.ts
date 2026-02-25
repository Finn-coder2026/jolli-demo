import { describe, expect, it, vi } from "vitest";

vi.mock("@tiptap/extension-code-block-lowlight", () => ({
	default: {
		extend: vi.fn(config => ({
			name: "codeBlock",
			type: "node",
			...config,
		})),
	},
}));

vi.mock("@tiptap/react", () => ({
	ReactNodeViewRenderer: vi.fn(component => component),
}));

vi.mock("./CodeBlockView", () => ({
	CodeBlockView: vi.fn(),
}));

describe("CodeBlockExtension", () => {
	it("should extend CodeBlockLowlight with addNodeView", async () => {
		const { default: CodeBlockLowlight } = await import("@tiptap/extension-code-block-lowlight");
		await import("./CodeBlockExtension");
		expect(CodeBlockLowlight.extend).toHaveBeenCalledWith(
			expect.objectContaining({
				addNodeView: expect.any(Function),
			}),
		);
	});

	it("should use ReactNodeViewRenderer with CodeBlockView in addNodeView", async () => {
		const { ReactNodeViewRenderer } = await import("@tiptap/react");
		const { CodeBlockExtension } = await import("./CodeBlockExtension");
		const ext = CodeBlockExtension as unknown as { addNodeView: () => unknown };
		const nodeView = ext.addNodeView();
		const { CodeBlockView } = await import("./CodeBlockView");
		expect(ReactNodeViewRenderer).toHaveBeenCalledWith(CodeBlockView);
		expect(nodeView).toBe(CodeBlockView);
	});
});
