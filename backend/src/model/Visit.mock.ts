import type { Visit } from "./Visit";

export function mockVisit(partial?: Partial<Visit>): Visit {
	return {
		id: 0,
		date: new Date(0),
		visitorId: "",
		userId: undefined,
		...partial,
	};
}
