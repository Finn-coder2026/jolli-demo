import type { DocHistory, NewDocHistory } from "./DocHistory";

export function mockDocHistory(partial?: Partial<DocHistory>): DocHistory {
	return {
		id: 0,
		docId: 0,
		userId: 0,
		docSnapshot: Buffer.from("{}"),
		version: 1,
		createdAt: new Date(0),
		...partial,
	};
}

export function mockNewDocHistory(partial?: Partial<NewDocHistory>): NewDocHistory {
	return {
		docId: 0,
		userId: 0,
		docSnapshot: Buffer.from("{}"),
		version: 1,
		...partial,
	};
}
