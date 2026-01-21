import { defineVisits, type NewVisit, type Visit } from "../model/Visit";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import type { Sequelize } from "sequelize";

export interface VisitDao {
	createVisit(visit: NewVisit): Promise<Visit>;
}

export function createVisitDao(sequelize: Sequelize): VisitDao {
	const Visits = defineVisits(sequelize);

	return {
		createVisit,
	};

	async function createVisit(visit: Visit): Promise<Visit> {
		return await Visits.create(visit);
	}
}

export function createVisitDaoProvider(defaultDao: VisitDao): DaoProvider<VisitDao> {
	return {
		getDao(context: TenantOrgContext | undefined): VisitDao {
			return context?.database.visitDao ?? defaultDao;
		},
	};
}
