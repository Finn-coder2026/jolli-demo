import { getConfig } from "../config/Config";
import { getEnvOrError } from "./Env";
import { randomBytes } from "node:crypto";
import connectSessionSequelize from "connect-session-sequelize";
import type { CookieOptions, RequestHandler } from "express";
import type { Request, Response } from "express-serve-static-core";
import session from "express-session";
import ms from "ms";
import type { Sequelize } from "sequelize";

const origin = getEnvOrError("ORIGIN");

function createCookieOptions(partial?: Partial<CookieOptions>): CookieOptions {
	return {
		httpOnly: true,
		maxAge: 365 * 24 * 60 * 60 * 1000,
		path: "/",
		secure: origin.startsWith("https://"),
		...partial,
	};
}

export function issueVisitorCookie(req: Request, res: Response): string {
	const visitorId = req.cookies.visitorId ?? randomBytes(16).toString("base64url").slice(0, 22);
	res.cookie("visitorId", visitorId, createCookieOptions({ sameSite: "strict" }));
	return visitorId;
}

export function issueAuthCookie(res: Response, token: string): void {
	const config = getConfig();
	const maxAge = ms(config.TOKEN_COOKIE_MAX_AGE);
	// Use "lax" to allow cookie on redirects from OAuth providers (strict blocks these)
	res.cookie("authToken", token, createCookieOptions({ sameSite: "lax", maxAge }));
}

export function clearAuthCookie(res: Response): void {
	res.clearCookie("authToken", { path: "/" });
}

export async function expressSessionHandler(sequelize: Sequelize): Promise<RequestHandler> {
	const SequelizeStore = connectSessionSequelize(session.Store);

	const store = new SequelizeStore({
		db: sequelize,
		tableName: "session",
	});

	await store.sync();

	return session({
		cookie: createCookieOptions(),
		name: "sessionId",
		resave: false,
		saveUninitialized: false,
		secret: getEnvOrError("SESSION_SECRET"),
		store,
	});
}
