import { adminView } from "./AdminView";
import { chatView } from "./ChatView";
import { convosView } from "./ConvosView";
import type { ViewDefinition } from "./types";

export type { ViewDefinition };

// Registry of all available views
export const VIEWS: Array<ViewDefinition> = [adminView, chatView, convosView];

// Get a view by name
export function getView(viewName: string): ViewDefinition | undefined {
	return VIEWS.find(view => view.name === viewName);
}
