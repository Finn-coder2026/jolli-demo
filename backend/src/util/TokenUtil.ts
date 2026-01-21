import { getConfig } from "../config/Config";
import type { Request } from "express";
import jwt, { type Algorithm, type SignOptions } from "jsonwebtoken";
import type { StringValue } from "ms";

export interface TokenUtil<T> {
	generateToken(payload: T): string;
	decodePayload(req: Request): T | undefined;
}

export interface TokenOptions {
	expiresIn: StringValue;
	algorithm: Algorithm;
}

export function createTokenUtilFromEnv<T extends object>(): TokenUtil<T> {
	return createTokenUtil<T>();
}

// should only be used in testing where we want to control the secret and options
export function createTokenUtil<T extends object>(secret?: string, options?: TokenOptions): TokenUtil<T> {
	return { generateToken, decodePayload };

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

			if (token) {
				return jwt.verify(token, tokenSecret) as T;
			}
		} catch {
			return;
		}
	}
}
