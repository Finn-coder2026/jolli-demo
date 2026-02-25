import { HiddenSectionExtension } from "./HiddenSectionExtension";
import type { DecorationSource } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tiptap/pm/view", async importOriginal => {
	const actual = await importOriginal<typeof import("@tiptap/pm/view")>();
	return {
		...actual,
		DecorationSet: {
			...actual.DecorationSet,
			empty: actual.DecorationSet.empty,
			create: vi.fn().mockReturnValue({ mock: "decoration-set" }),
		},
		Decoration: {
			...actual.Decoration,
			node: vi.fn().mockReturnValue({ mock: "decoration" }),
		},
	};
});

describe("HiddenSectionExtension", () => {
	it("should have name 'hiddenSection'", () => {
		expect(HiddenSectionExtension.name).toBe("hiddenSection");
	});

	it("should be an extension type", () => {
		expect(HiddenSectionExtension.type).toBe("extension");
	});

	it("should have addStorage method defined", () => {
		expect(HiddenSectionExtension.config.addStorage).toBeDefined();
	});

	it("should have addProseMirrorPlugins method defined", () => {
		expect(HiddenSectionExtension.config.addProseMirrorPlugins).toBeDefined();
	});

	describe("addStorage", () => {
		it("should return storage with empty hiddenRanges array", () => {
			const addStorage = HiddenSectionExtension.config.addStorage;
			if (addStorage) {
				const storage = addStorage.call(HiddenSectionExtension as never);
				expect(storage).toEqual({ hiddenRanges: [] });
			}
		});
	});

	describe("addProseMirrorPlugins", () => {
		it("should return an array of plugins", () => {
			const addProseMirrorPlugins = HiddenSectionExtension.config.addProseMirrorPlugins;
			if (addProseMirrorPlugins) {
				const mockThis = {
					storage: { hiddenRanges: [] },
				};
				const plugins = addProseMirrorPlugins.call(mockThis as never);
				expect(Array.isArray(plugins)).toBe(true);
				expect(plugins?.length).toBe(1);
			}
		});

		it("should create a plugin with decorations prop", () => {
			const addProseMirrorPlugins = HiddenSectionExtension.config.addProseMirrorPlugins;
			if (addProseMirrorPlugins) {
				const mockThis = {
					storage: { hiddenRanges: [] },
				};
				const plugins = addProseMirrorPlugins.call(mockThis as never);
				const plugin = plugins?.[0];
				expect(plugin?.props?.decorations).toBeDefined();
				expect(typeof plugin?.props?.decorations).toBe("function");
			}
		});

		it("should create plugin with key", () => {
			const addProseMirrorPlugins = HiddenSectionExtension.config.addProseMirrorPlugins;
			if (addProseMirrorPlugins) {
				const mockThis = {
					storage: { hiddenRanges: [] },
				};
				const plugins = addProseMirrorPlugins.call(mockThis as never);
				const plugin = plugins?.[0];
				expect(plugin?.spec?.key).toBeDefined();
			}
		});

		describe("decorations function", () => {
			function createMockDoc(
				nodes: Array<{ type: { name: string }; textContent: string; nodeSize: number; isBlock: boolean }>,
			) {
				return {
					content: { size: 100 },
					descendants(cb: (node: unknown, pos: number) => boolean) {
						let pos = 0;
						for (const node of nodes) {
							const shouldContinue = cb(node, pos);
							pos += node.nodeSize;
							if (shouldContinue === false) {
								break;
							}
						}
					},
				};
			}

			function getDecorationsFn(hiddenRanges: Array<{ title: string | null }>) {
				const addProseMirrorPlugins = HiddenSectionExtension.config.addProseMirrorPlugins;
				if (!addProseMirrorPlugins) {
					throw new Error("addProseMirrorPlugins not defined");
				}
				const mockThis = { storage: { hiddenRanges } };
				const plugins = addProseMirrorPlugins.call(mockThis as never);
				const plugin = plugins?.[0];
				return plugin?.props?.decorations as (state: unknown) => DecorationSource;
			}

			it("should return empty DecorationSet when hiddenRanges is empty", () => {
				const decorationsFn = getDecorationsFn([]);
				const mockState = { doc: createMockDoc([]) };
				const result = decorationsFn(mockState);
				expect(result).toBe(DecorationSet.empty);
			});

			it("should return empty DecorationSet when hiddenRanges is falsy", () => {
				const addProseMirrorPlugins = HiddenSectionExtension.config.addProseMirrorPlugins;
				if (!addProseMirrorPlugins) {
					throw new Error("addProseMirrorPlugins not defined");
				}
				const mockThis = {
					storage: { hiddenRanges: null as unknown as Array<{ title: string | null }> },
				};
				const plugins = addProseMirrorPlugins.call(mockThis as never);
				const decorationsFn = plugins?.[0]?.props?.decorations as (state: unknown) => DecorationSource;
				const mockState = { doc: createMockDoc([]) };
				const result = decorationsFn(mockState);
				expect(result).toBe(DecorationSet.empty);
			});

			it("should create decorations for block nodes when title is null", () => {
				const decorationsFn = getDecorationsFn([{ title: null }]);
				const mockDoc = createMockDoc([
					{ type: { name: "paragraph" }, textContent: "hello", nodeSize: 10, isBlock: true },
					{ type: { name: "paragraph" }, textContent: "world", nodeSize: 12, isBlock: true },
				]);
				const mockState = { doc: mockDoc };
				decorationsFn(mockState);
				expect(Decoration.node).toHaveBeenCalledWith(0, 10, { class: "hidden-section-content" });
				expect(DecorationSet.create).toHaveBeenCalledWith(mockDoc, expect.arrayContaining([]));
			});

			it("should find and decorate a section by title", () => {
				vi.mocked(Decoration.node).mockClear();
				const decorationsFn = getDecorationsFn([{ title: "My Section" }]);
				const mockDoc = {
					content: { size: 100 },
					descendants(cb: (node: unknown, pos: number) => boolean) {
						cb({ type: { name: "heading" }, textContent: "My Section", nodeSize: 15, isBlock: true }, 0);
						cb({ type: { name: "paragraph" }, textContent: "content", nodeSize: 10, isBlock: true }, 15);
					},
				};
				const mockState = { doc: mockDoc };
				decorationsFn(mockState);
				expect(Decoration.node).toHaveBeenCalledWith(0, 15, { class: "hidden-section-content" });
				expect(Decoration.node).toHaveBeenCalledWith(15, 25, { class: "hidden-section-content" });
				expect(DecorationSet.create).toHaveBeenCalled();
			});

			it("should stop at the next heading when title is specified", () => {
				vi.mocked(Decoration.node).mockClear();
				const decorationsFn = getDecorationsFn([{ title: "Section A" }]);
				const mockDoc = {
					content: { size: 100 },
					descendants(cb: (node: unknown, pos: number) => boolean) {
						cb({ type: { name: "heading" }, textContent: "Section A", nodeSize: 14, isBlock: true }, 0);
						cb({ type: { name: "paragraph" }, textContent: "content A", nodeSize: 12, isBlock: true }, 14);
						cb({ type: { name: "heading" }, textContent: "Section B", nodeSize: 14, isBlock: true }, 26);
						cb({ type: { name: "paragraph" }, textContent: "content B", nodeSize: 12, isBlock: true }, 40);
					},
				};
				const mockState = { doc: mockDoc };
				decorationsFn(mockState);
				expect(Decoration.node).toHaveBeenCalledWith(0, 14, { class: "hidden-section-content" });
				expect(Decoration.node).toHaveBeenCalledWith(14, 26, { class: "hidden-section-content" });
				expect(Decoration.node).toHaveBeenCalledTimes(2);
			});

			it("should stop iteration after section ends with null title", () => {
				vi.mocked(Decoration.node).mockClear();
				const decorationsFn = getDecorationsFn([{ title: null }]);
				const mockDoc = {
					content: { size: 100 },
					descendants(cb: (node: unknown, pos: number) => boolean) {
						cb({ type: { name: "paragraph" }, textContent: "before", nodeSize: 10, isBlock: true }, 0);
						cb({ type: { name: "heading" }, textContent: "Header", nodeSize: 10, isBlock: true }, 10);
						cb({ type: { name: "paragraph" }, textContent: "after", nodeSize: 10, isBlock: true }, 20);
					},
				};
				const mockState = { doc: mockDoc };
				decorationsFn(mockState);
				expect(Decoration.node).toHaveBeenCalledWith(0, 10, { class: "hidden-section-content" });
				expect(Decoration.node).toHaveBeenCalledTimes(1);
			});

			it("should not enter a section when heading title does not match", () => {
				vi.mocked(Decoration.node).mockClear();
				const decorationsFn = getDecorationsFn([{ title: "Target" }]);
				const mockDoc = createMockDoc([
					{
						type: { name: "heading" },
						textContent: "Other Section",
						nodeSize: 18,
						isBlock: true,
					},
					{ type: { name: "paragraph" }, textContent: "content", nodeSize: 10, isBlock: true },
				]);
				const mockState = { doc: mockDoc };
				decorationsFn(mockState);
				expect(Decoration.node).not.toHaveBeenCalled();
			});

			it("should not hide sectionSuggestion nodes that belong to the next section", () => {
				vi.mocked(Decoration.node).mockClear();
				const decorationsFn = getDecorationsFn([{ title: "侠客行" }]);
				const mockDoc = {
					content: { size: 200 },
					descendants(cb: (node: unknown, pos: number) => boolean) {
						cb({ type: { name: "heading" }, textContent: "侠客行", nodeSize: 14, isBlock: true }, 0);
						cb({ type: { name: "paragraph" }, textContent: "作者：李白", nodeSize: 12, isBlock: true }, 14);
						cb({ type: { name: "sectionSuggestion" }, textContent: "", nodeSize: 1, isBlock: true }, 26);
						cb({ type: { name: "heading" }, textContent: "诗人目录", nodeSize: 14, isBlock: true }, 27);
						cb({ type: { name: "paragraph" }, textContent: "本文介绍了", nodeSize: 12, isBlock: true }, 41);
					},
				};
				const mockState = { doc: mockDoc };
				decorationsFn(mockState);
				expect(Decoration.node).toHaveBeenCalledWith(0, 14, { class: "hidden-section-content" });
				expect(Decoration.node).toHaveBeenCalledWith(14, 26, { class: "hidden-section-content" });
				expect(Decoration.node).toHaveBeenCalledTimes(2);
			});

			it("should return true for traversal of inline non-heading nodes outside section", () => {
				vi.mocked(Decoration.node).mockClear();
				const decorationsFn = getDecorationsFn([{ title: "Target" }]);
				const mockDoc = createMockDoc([
					{ type: { name: "text" }, textContent: "inline", nodeSize: 6, isBlock: false },
				]);
				const mockState = { doc: mockDoc };
				decorationsFn(mockState);
				expect(Decoration.node).not.toHaveBeenCalled();
			});
		});
	});
});
