import { getConfig, getGlobalConfig } from "../config/Config";
import type { Request } from "express";
import type { UserInfo } from "jolli-common";
import jwt, { type Algorithm, type SignOptions } from "jsonwebtoken";
import type { StringValue } from "ms";

export interface TokenUtil<T> {
	generateToken(payload: T): string;
	decodePayload(req: Request): T | undefined;
	decodePayloadFromToken(token: string): T | undefined;
}

// Module-level singleton for global access
let globalTokenUtil: TokenUtil<UserInfo> | null = null;

/**
 * Set the global TokenUtil instance.
 * Called during app startup in AppFactory.ts.
 */
export function setGlobalTokenUtil(tokenUtil: TokenUtil<UserInfo>): void {
	globalTokenUtil = tokenUtil;
}

/**
 * Get the global TokenUtil instance.
 * Returns null if not initialized.
 */
export function getGlobalTokenUtil(): TokenUtil<UserInfo> | null {
	return globalTokenUtil;
}

export interface TokenOptions {
	expiresIn: StringValue;
	algorithm: Algorithm;
}

export interface SandboxServiceTokenParams {
	userId: number;
	email: string;
	name: string;
	picture: string | undefined;
	spaceSlug: string;
	tenantId?: string;
	orgId?: string;
	ttl?: StringValue;
}

export interface SandboxServiceTokenPayload extends UserInfo {
	tokenType: "sandbox-service";
	spaceSlug: string;
}

/**
 * Creates a short-lived service token for sandboxed CLI workflows.
 * Uses the global TOKEN_SECRET (not per-tenant derived) because the sync
 * endpoint verifies tokens before tenant context is established.
 */
export function createSandboxServiceToken(params: SandboxServiceTokenParams): string {
	const config = getGlobalConfig();
	const payload: SandboxServiceTokenPayload = {
		userId: params.userId,
		email: params.email,
		name: params.name,
		picture: params.picture,
		tenantId: params.tenantId,
		orgId: params.orgId,
		tokenType: "sandbox-service",
		spaceSlug: params.spaceSlug,
	};
	return jwt.sign(payload, config.TOKEN_SECRET, {
		algorithm: config.TOKEN_ALGORITHM,
		expiresIn: params.ttl ?? "30m",
	} as SignOptions);
}

export function createTokenUtilFromEnv<T extends object>(): TokenUtil<T> {
	return createTokenUtil<T>();
}

// should only be used in testing where we want to control the secret and options
export function createTokenUtil<T extends object>(secret?: string, options?: TokenOptions): TokenUtil<T> {
	return { generateToken, decodePayload, decodePayloadFromToken };

	function generateToken(payload: T): string {
		if (secret && options) {
			return jwt.sign(payload, secret, {
				algorithm: options.algorithm,
				expiresIn: options.expiresIn,
			} as SignOptions);
		}
		const config = getConfig();
		return jwt.sign(payload, config.TOKEN_SECRET, {
			algorithm: config.TOKEN_ALGORITHM,
			expiresIn: config.TOKEN_EXPIRES_IN,
		} as SignOptions);
	}

	function decodePayload(req: Request): T | undefined {
		const tokenSecret = secret || getConfig().TOKEN_SECRET;
		try {
			let token = req.cookies?.authToken;

			const authHeader = req.headers.authorization;
			if (authHeader?.startsWith("Bearer ")) {
				token = authHeader.slice(7);
			}

			if (!token) {
				const queryToken = req.query?.token;
				const acceptHeader = req.headers.accept;
				const acceptsSse = typeof acceptHeader === "string" && acceptHeader.includes("text/event-stream");
				const isStreamPath = req.path?.endsWith("/stream");

				if (typeof queryToken === "string" && (acceptsSse || isStreamPath)) {
					token = queryToken;
				}
			}

			if (token) {
				return jwt.verify(token, tokenSecret) as T;
			}
		} catch {
			return;
		}
	}

	function decodePayloadFromToken(token: string): T | undefined {
		const tokenSecret = secret || getConfig().TOKEN_SECRET;
		try {
			return jwt.verify(token, tokenSecret) as T;
		} catch {
			return;
		}
	}
}
