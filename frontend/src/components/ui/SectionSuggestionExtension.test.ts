import { SectionSuggestionExtension } from "./SectionSuggestionExtension";
import { describe, expect, it, vi } from "vitest";

describe("SectionSuggestionExtension", () => {
	it("should have name 'sectionSuggestion'", () => {
		expect(SectionSuggestionExtension.name).toBe("sectionSuggestion");
	});

	it("should be a node type extension", () => {
		expect(SectionSuggestionExtension.type).toBe("node");
	});

	it("should have addAttributes method defined", () => {
		expect(SectionSuggestionExtension.config.addAttributes).toBeDefined();
	});

	it("should have addNodeView method defined", () => {
		expect(SectionSuggestionExtension.config.addNodeView).toBeDefined();
	});

	it("should have addStorage method defined", () => {
		expect(SectionSuggestionExtension.config.addStorage).toBeDefined();
	});

	it("should have addCommands method defined", () => {
		expect(SectionSuggestionExtension.config.addCommands).toBeDefined();
	});

	it("should be an atom node", () => {
		expect(SectionSuggestionExtension.config.atom).toBe(true);
	});

	it("should be selectable", () => {
		expect(SectionSuggestionExtension.config.selectable).toBe(true);
	});

	it("should not be draggable", () => {
		expect(SectionSuggestionExtension.config.draggable).toBe(false);
	});

	it("should be in block group", () => {
		expect(SectionSuggestionExtension.config.group).toBe("block");
	});

	describe("addStorage", () => {
		it("should return storage with null callbacks", () => {
			const addStorage = SectionSuggestionExtension.config.addStorage;
			if (addStorage) {
				const storage = addStorage.call(SectionSuggestionExtension as never);
				expect(storage).toEqual({
					onApply: null,
					onDismiss: null,
				});
			}
		});
	});

	describe("addAttributes", () => {
		it("should return all required attributes", () => {
			const addAttrs = SectionSuggestionExtension.config.addAttributes;
			if (addAttrs) {
				const attrs = addAttrs.call(SectionSuggestionExtension as never) as Record<string, unknown>;
				expect(attrs.changeId).toBeDefined();
				expect(attrs.draftId).toBeDefined();
				expect(attrs.sectionPath).toBeDefined();
				expect(attrs.originalContent).toBeDefined();
				expect(attrs.suggestedContent).toBeDefined();
				expect(attrs.changeType).toBeDefined();
				expect(attrs.description).toBeDefined();
			}
		});

		it("should have correct default values", () => {
			const addAttrs = SectionSuggestionExtension.config.addAttributes;
			if (addAttrs) {
				const attrs = addAttrs.call(SectionSuggestionExtension as never) as Record<
					string,
					{ default: unknown }
				>;
				expect(attrs.changeId.default).toBeNull();
				expect(attrs.draftId.default).toBeNull();
				expect(attrs.sectionPath.default).toBe("");
				expect(attrs.originalContent.default).toBe("");
				expect(attrs.suggestedContent.default).toBe("");
				expect(attrs.changeType.default).toBe("update");
				expect(attrs.description.default).toBe("");
			}
		});
	});

	describe("parseHTML", () => {
		it("should parse div with data-section-suggestion attribute", () => {
			const parseHTML = SectionSuggestionExtension.config.parseHTML;
			if (parseHTML) {
				const rules = parseHTML.call(SectionSuggestionExtension as never);
				expect(rules).toEqual([{ tag: 'div[data-section-suggestion="true"]' }]);
			}
		});
	});

	describe("renderHTML", () => {
		it("should render div with data-section-suggestion attribute", () => {
			const renderHTML = SectionSuggestionExtension.config.renderHTML;
			if (renderHTML) {
				const renderFn = renderHTML as (opts: { HTMLAttributes: Record<string, string> }) => unknown;
				const result = renderFn.call(SectionSuggestionExtension, { HTMLAttributes: { class: "test" } });
				expect(result).toEqual(["div", { "data-section-suggestion": "true", class: "test" }]);
			}
		});
	});

	describe("addNodeView", () => {
		it("should return a ReactNodeViewRenderer function", () => {
			const addNodeView = SectionSuggestionExtension.config.addNodeView;
			if (addNodeView) {
				const result = addNodeView.call(SectionSuggestionExtension as never);
				expect(typeof result).toBe("function");
			}
		});
	});

	describe("addCommands", () => {
		function getCommands() {
			const addCommands = SectionSuggestionExtension.config.addCommands;
			if (!addCommands) {
				throw new Error("addCommands not defined");
			}
			const mockThis = { name: "sectionSuggestion" };
			return addCommands.call(mockThis as never);
		}

		it("should return all suggestion commands", () => {
			const commands = getCommands();
			expect(commands.insertSectionSuggestion).toBeDefined();
			expect(commands.removeSectionSuggestion).toBeDefined();
			expect(commands.removeAllSectionSuggestions).toBeDefined();
			expect(typeof commands.insertSectionSuggestion).toBe("function");
			expect(typeof commands.removeSectionSuggestion).toBe("function");
			expect(typeof commands.removeAllSectionSuggestions).toBe("function");
		});

		it("insertSectionSuggestion returns a command function", () => {
			const commands = getCommands();
			const cmdFn = commands.insertSectionSuggestion?.({
				changeId: 1,
				draftId: 100,
				sectionPath: "/sections/0",
				sectionTitle: "Test",
				originalContent: "original",
				suggestedContent: "suggested",
				changeType: "update",
				description: "test desc",
			});
			expect(typeof cmdFn).toBe("function");
		});

		it("insertSectionSuggestion command calls chain().insertContent().run()", () => {
			const commands = getCommands();
			const cmdFn = commands.insertSectionSuggestion?.({
				changeId: 1,
				draftId: 100,
				sectionPath: "/sections/0",
				sectionTitle: "Test",
				originalContent: "original",
				suggestedContent: "suggested",
				changeType: "update",
				description: "test desc",
			});

			const mockRun = vi.fn().mockReturnValue(true);
			const mockInsertContent = vi.fn().mockReturnValue({ run: mockRun });
			const mockChain = vi.fn().mockReturnValue({ insertContent: mockInsertContent });

			const result = (cmdFn as unknown as (props: { chain: typeof mockChain }) => boolean)({
				chain: mockChain,
			});

			expect(mockChain).toHaveBeenCalled();
			expect(mockInsertContent).toHaveBeenCalledWith({
				type: "sectionSuggestion",
				attrs: {
					changeId: 1,
					draftId: 100,
					sectionPath: "/sections/0",
					sectionTitle: "Test",
					originalContent: "original",
					suggestedContent: "suggested",
					changeType: "update",
					description: "test desc",
				},
			});
			expect(mockRun).toHaveBeenCalled();
			expect(result).toBe(true);
		});

		it("removeSectionSuggestion returns a command function", () => {
			const commands = getCommands();
			const cmdFn = commands.removeSectionSuggestion?.(1);
			expect(typeof cmdFn).toBe("function");
		});

		it("removeSectionSuggestion finds and deletes matching node", () => {
			const commands = getCommands();
			const cmdFn = commands.removeSectionSuggestion?.(42);

			const mockDelete = vi.fn();
			const mockTr = { delete: mockDelete };
			const mockDispatch = vi.fn();

			const matchingNode = {
				type: { name: "sectionSuggestion" },
				attrs: { changeId: 42 },
				nodeSize: 5,
			};

			const mockState = {
				tr: mockTr,
				doc: {
					descendants(cb: (node: unknown, pos: number) => boolean) {
						cb(matchingNode, 10);
					},
				},
			};

			const result = (
				cmdFn as unknown as (props: { state: typeof mockState; dispatch: typeof mockDispatch }) => boolean
			)({
				state: mockState,
				dispatch: mockDispatch,
			});

			expect(mockDelete).toHaveBeenCalledWith(10, 15);
			expect(mockDispatch).toHaveBeenCalledWith(mockTr);
			expect(result).toBe(true);
		});

		it("removeSectionSuggestion returns false when node not found", () => {
			const commands = getCommands();
			const cmdFn = commands.removeSectionSuggestion?.(99);

			const mockDispatch = vi.fn();
			const mockState = {
				tr: { delete: vi.fn() },
				doc: {
					descendants(cb: (node: unknown, pos: number) => boolean) {
						cb(
							{
								type: { name: "sectionSuggestion" },
								attrs: { changeId: 1 },
								nodeSize: 5,
							},
							0,
						);
					},
				},
			};

			const result = (
				cmdFn as unknown as (props: { state: typeof mockState; dispatch: typeof mockDispatch }) => boolean
			)({
				state: mockState,
				dispatch: mockDispatch,
			});

			expect(mockDispatch).not.toHaveBeenCalled();
			expect(result).toBe(false);
		});

		it("removeSectionSuggestion skips delete when dispatch is undefined", () => {
			const commands = getCommands();
			const cmdFn = commands.removeSectionSuggestion?.(42);

			const mockDelete = vi.fn();
			const mockTr = { delete: mockDelete };

			const matchingNode = {
				type: { name: "sectionSuggestion" },
				attrs: { changeId: 42 },
				nodeSize: 5,
			};

			const mockState = {
				tr: mockTr,
				doc: {
					descendants(cb: (node: unknown, pos: number) => boolean) {
						cb(matchingNode, 10);
					},
				},
			};

			const result = (cmdFn as unknown as (props: { state: typeof mockState; dispatch: undefined }) => boolean)({
				state: mockState,
				dispatch: undefined,
			});

			expect(mockDelete).not.toHaveBeenCalled();
			expect(result).toBe(true);
		});

		it("removeSectionSuggestion skips non-matching node types", () => {
			const commands = getCommands();
			const cmdFn = commands.removeSectionSuggestion?.(42);

			const mockDispatch = vi.fn();
			const mockState = {
				tr: { delete: vi.fn() },
				doc: {
					descendants(cb: (node: unknown, pos: number) => boolean) {
						cb(
							{
								type: { name: "paragraph" },
								attrs: { changeId: 42 },
								nodeSize: 5,
							},
							0,
						);
					},
				},
			};

			const result = (
				cmdFn as unknown as (props: { state: typeof mockState; dispatch: typeof mockDispatch }) => boolean
			)({
				state: mockState,
				dispatch: mockDispatch,
			});

			expect(result).toBe(false);
		});

		it("removeAllSectionSuggestions returns a command function", () => {
			const commands = getCommands();
			const cmdFn = commands.removeAllSectionSuggestions?.();
			expect(typeof cmdFn).toBe("function");
		});

		it("removeAllSectionSuggestions deletes suggestion nodes and adjacent empty paragraphs", () => {
			const commands = getCommands();
			const cmdFn = commands.removeAllSectionSuggestions?.();

			const mockDelete = vi.fn();
			const mockTr = { delete: mockDelete };
			const mockDispatch = vi.fn();

			// Document layout: [emptyPara(2)][suggestion(1)][contentPara(10)][suggestion(1)]
			// Positions:        0              2             3               13
			const emptyPara = { type: { name: "paragraph" }, attrs: {}, nodeSize: 2, content: { size: 0 } };
			const suggestion1 = { type: { name: "sectionSuggestion" }, attrs: { changeId: 1 }, nodeSize: 1 };
			const contentPara = { type: { name: "paragraph" }, attrs: {}, nodeSize: 10, content: { size: 8 } };
			const suggestion2 = { type: { name: "sectionSuggestion" }, attrs: { changeId: 2 }, nodeSize: 1 };
			const allChildren = [emptyPara, suggestion1, contentPara, suggestion2];

			const mockDocNode = {
				childCount: allChildren.length,
				child(index: number) {
					return allChildren[index];
				},
			};

			// Calculate positions for each child
			const childPositions = [0, 2, 3, 13];

			const mockState = {
				tr: mockTr,
				doc: {
					content: { size: 14 },
					descendants(cb: (node: unknown, pos: number) => boolean) {
						for (let i = 0; i < allChildren.length; i++) {
							cb(allChildren[i], childPositions[i]);
						}
					},
					resolve(pos: number) {
						// Find which child index this position corresponds to
						let idx = 0;
						for (let i = 0; i < childPositions.length; i++) {
							if (childPositions[i] <= pos) {
								idx = i;
							}
						}
						return {
							index: () => idx,
							node: () => mockDocNode,
						};
					},
				},
			};

			const result = (
				cmdFn as unknown as (props: { state: typeof mockState; dispatch: typeof mockDispatch }) => boolean
			)({
				state: mockState,
				dispatch: mockDispatch,
			});

			expect(result).toBe(true);
			// Should delete: suggestion2(13,14), suggestion1(2,3), emptyPara(0,2)
			// in reverse position order
			expect(mockDelete).toHaveBeenCalledTimes(3);
			expect(mockDelete).toHaveBeenNthCalledWith(1, 13, 14);
			expect(mockDelete).toHaveBeenNthCalledWith(2, 2, 3);
			expect(mockDelete).toHaveBeenNthCalledWith(3, 0, 2);
			expect(mockDispatch).toHaveBeenCalledWith(mockTr);
		});

		it("removeAllSectionSuggestions skips non-empty paragraphs adjacent to suggestions", () => {
			const commands = getCommands();
			const cmdFn = commands.removeAllSectionSuggestions?.();

			const mockDelete = vi.fn();
			const mockTr = { delete: mockDelete };
			const mockDispatch = vi.fn();

			// Document layout: [contentPara(10)][suggestion(1)]
			const contentPara = { type: { name: "paragraph" }, attrs: {}, nodeSize: 10, content: { size: 8 } };
			const suggestion = { type: { name: "sectionSuggestion" }, attrs: { changeId: 1 }, nodeSize: 1 };
			const allChildren = [contentPara, suggestion];
			const childPositions = [0, 10];

			const mockDocNode = {
				childCount: allChildren.length,
				child(index: number) {
					return allChildren[index];
				},
			};

			const mockState = {
				tr: mockTr,
				doc: {
					content: { size: 11 },
					descendants(cb: (node: unknown, pos: number) => boolean) {
						for (let i = 0; i < allChildren.length; i++) {
							cb(allChildren[i], childPositions[i]);
						}
					},
					resolve(pos: number) {
						let idx = 0;
						for (let i = 0; i < childPositions.length; i++) {
							if (childPositions[i] <= pos) {
								idx = i;
							}
						}
						return {
							index: () => idx,
							node: () => mockDocNode,
						};
					},
				},
			};

			const result = (
				cmdFn as unknown as (props: { state: typeof mockState; dispatch: typeof mockDispatch }) => boolean
			)({
				state: mockState,
				dispatch: mockDispatch,
			});

			expect(result).toBe(true);
			// Only the suggestion node should be deleted, not the content paragraph
			expect(mockDelete).toHaveBeenCalledTimes(1);
			expect(mockDelete).toHaveBeenCalledWith(10, 11);
			expect(mockDispatch).toHaveBeenCalledWith(mockTr);
		});

		it("removeAllSectionSuggestions returns false when no suggestions exist", () => {
			const commands = getCommands();
			const cmdFn = commands.removeAllSectionSuggestions?.();

			const mockDispatch = vi.fn();
			const mockState = {
				tr: { delete: vi.fn() },
				doc: {
					content: { size: 10 },
					descendants(cb: (node: unknown, pos: number) => boolean) {
						cb({ type: { name: "paragraph" }, attrs: {}, nodeSize: 10, content: { size: 8 } }, 0);
					},
				},
			};

			const result = (
				cmdFn as unknown as (props: { state: typeof mockState; dispatch: typeof mockDispatch }) => boolean
			)({
				state: mockState,
				dispatch: mockDispatch,
			});

			expect(result).toBe(false);
			expect(mockDispatch).not.toHaveBeenCalled();
		});

		it("removeAllSectionSuggestions skips delete when dispatch is undefined", () => {
			const commands = getCommands();
			const cmdFn = commands.removeAllSectionSuggestions?.();

			const mockDelete = vi.fn();
			const mockTr = { delete: mockDelete };

			const mockState = {
				tr: mockTr,
				doc: {
					content: { size: 6 },
					descendants(cb: (node: unknown, pos: number) => boolean) {
						cb({ type: { name: "sectionSuggestion" }, attrs: { changeId: 1 }, nodeSize: 1 }, 5);
					},
				},
			};

			const result = (cmdFn as unknown as (props: { state: typeof mockState; dispatch: undefined }) => boolean)({
				state: mockState,
				dispatch: undefined,
			});

			expect(result).toBe(true);
			expect(mockDelete).not.toHaveBeenCalled();
		});

		it("removeAllSectionSuggestions deduplicates shared empty paragraphs between suggestions", () => {
			const commands = getCommands();
			const cmdFn = commands.removeAllSectionSuggestions?.();

			const mockDelete = vi.fn();
			const mockTr = { delete: mockDelete };
			const mockDispatch = vi.fn();

			// Document: [suggestion(1)][emptyPara(2)][suggestion(1)]
			// The empty paragraph is "after" suggestion1 AND "before" suggestion2
			const suggestion1 = { type: { name: "sectionSuggestion" }, attrs: { changeId: 1 }, nodeSize: 1 };
			const emptyPara = { type: { name: "paragraph" }, attrs: {}, nodeSize: 2, content: { size: 0 } };
			const suggestion2 = { type: { name: "sectionSuggestion" }, attrs: { changeId: 2 }, nodeSize: 1 };
			const allChildren = [suggestion1, emptyPara, suggestion2];
			const childPositions = [0, 1, 3];

			const mockDocNode = {
				childCount: allChildren.length,
				child(index: number) {
					return allChildren[index];
				},
			};

			const mockState = {
				tr: mockTr,
				doc: {
					content: { size: 4 },
					descendants(cb: (node: unknown, pos: number) => boolean) {
						for (let i = 0; i < allChildren.length; i++) {
							cb(allChildren[i], childPositions[i]);
						}
					},
					resolve(pos: number) {
						let idx = 0;
						for (let i = 0; i < childPositions.length; i++) {
							if (childPositions[i] <= pos) {
								idx = i;
							}
						}
						return {
							index: () => idx,
							node: () => mockDocNode,
						};
					},
				},
			};

			const result = (
				cmdFn as unknown as (props: { state: typeof mockState; dispatch: typeof mockDispatch }) => boolean
			)({
				state: mockState,
				dispatch: mockDispatch,
			});

			expect(result).toBe(true);
			// 3 deletions: both suggestions + the shared empty paragraph (deduplicated)
			expect(mockDelete).toHaveBeenCalledTimes(3);
			expect(mockDispatch).toHaveBeenCalledWith(mockTr);
		});
	});
});
