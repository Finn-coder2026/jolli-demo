import { Extension } from "@tiptap/core";
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state";

export interface ArticleLinkPluginState {
	active: boolean;
	query: string;
	range: { from: number; to: number } | null;
	/**
	 * The absolute document position of a `[[` trigger that has been
	 * invalidated by a space.  Once invalidated, the same `[[` (same
	 * position) will never re-activate – even if the space is later
	 * deleted with backspace.
	 */
	invalidatedFrom: number | null;
}

export const ArticleLinkPluginKey = new PluginKey<ArticleLinkPluginState>("articleLink");

const TRIGGER = "[[";
const INACTIVE: ArticleLinkPluginState = { active: false, query: "", range: null, invalidatedFrom: null };

/* v8 ignore start -- ProseMirror plugin, requires full editor instance to test */
function deriveState(state: EditorState, prev: ArticleLinkPluginState): ArticleLinkPluginState {
	const { selection } = state;

	if (!selection.empty) {
		return { ...INACTIVE, invalidatedFrom: prev.invalidatedFrom };
	}

	const { $from } = selection;
	const textBefore = $from.parent.textBetween(0, $from.parentOffset);
	const triggerIndex = textBefore.lastIndexOf(TRIGGER);

	if (triggerIndex === -1) {
		// No trigger found – clear invalidation as well
		return INACTIVE;
	}

	const from = $from.start() + triggerIndex;
	const to = $from.pos;
	const query = textBefore.slice(triggerIndex + TRIGGER.length);

	// Space currently present → invalidate this trigger position
	if (query.includes(" ")) {
		return { active: false, query: "", range: null, invalidatedFrom: from };
	}

	// Trigger position matches a previously-invalidated position
	// (space was typed and then backspaced) → stay inactive
	if (from === prev.invalidatedFrom) {
		return { active: false, query, range: { from, to }, invalidatedFrom: from };
	}

	// New trigger at a different position → clear old invalidation
	return { active: true, query, range: { from, to }, invalidatedFrom: null };
}

/**
 * ArticleLinkExtension - Detects `[[` input and provides plugin state
 * for rendering a floating article link menu.
 */
export const ArticleLinkExtension = Extension.create({
	// Use a unique extension name to avoid conflicting with the articleLink node extension.
	name: "articleLinkTrigger",

	addProseMirrorPlugins() {
		return [
			new Plugin<ArticleLinkPluginState>({
				key: ArticleLinkPluginKey,

				state: {
					init: () => ({ ...INACTIVE }),
					apply(_tr, prev, _oldState, newState) {
						return deriveState(newState, prev);
					},
				},
			}),
		];
	},
});
/* v8 ignore stop */
