import type { DaoProvider } from "../dao/DaoProvider";
import type { VisitDao } from "../dao/VisitDao";
import { getTenantContext } from "../tenant/TenantContext";
import { issueVisitorCookie } from "../util/Cookies";
import { getOptionalUserId } from "../util/RouterUtil";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Router } from "express";
import type { UserInfo } from "jolli-common";

export function createVisitRouter(visitDaoProvider: DaoProvider<VisitDao>, tokenUtil: TokenUtil<UserInfo>): Router {
	const router = express.Router();

	router.post("/create", async (req, res) => {
		const visitDao = visitDaoProvider.getDao(getTenantContext());
		const visitorId = issueVisitorCookie(req, res);
		const userId = getOptionalUserId(tokenUtil, req);
		await visitDao.createVisit({ visitorId, userId });
		res.json({ success: true });
	});

	return router;
}
