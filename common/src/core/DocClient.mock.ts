import { mockDocDraft } from "../types/DocDraft.mock";
import { mockDoc } from "./Doc.mock";
import type { DocClient } from "./DocClient";

export function mockDocClient(partial?: Partial<DocClient>): DocClient {
	const doc = mockDoc();
	const draft = mockDocDraft();
	return {
		createDoc: async () => doc,
		listDocs: async () => [doc],
		findDoc: async (jrn: string) => (doc.jrn === jrn ? doc : undefined),
		updateDoc: async () => doc,
		deleteDoc: async () => void 0,
		clearAll: async () => void 0,
		search: async () => ({ chunks: [] }),
		searchByTitle: async () => [],
		createDraftFromArticle: async () => draft,
		...partial,
	} as DocClient;
}
