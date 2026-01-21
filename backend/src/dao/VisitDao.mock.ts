import { mockVisit } from "../model/Visit.mock";
import type { VisitDao } from "./VisitDao";

export function mockVisitDao(partial?: Partial<VisitDao>): VisitDao {
	return {
		createVisit: async visit => mockVisit(visit),
		...partial,
	};
}
