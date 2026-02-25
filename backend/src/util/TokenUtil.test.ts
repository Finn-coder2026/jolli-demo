import { resetConfig } from "../config/Config";
import {
	createSandboxServiceToken,
	createTokenUtil,
	createTokenUtilFromEnv,
	getGlobalTokenUtil,
	setGlobalTokenUtil,
	type TokenUtil,
} from "./TokenUtil";
import type { UserInfo } from "jolli-common";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface RequestWithCookies {
	cookies?: Record<string, string>;
	headers?: Record<string, string>;
	query?: Record<string, string>;
	path?: string;
}

interface TestPayload {
	userId: number;
	email: string;
}

describe("TokenUtil", () => {
	let tokenUtil: TokenUtil<TestPayload>;
	const secret = "test-secret";

	beforeEach(() => {
		tokenUtil = createTokenUtil<TestPayload>(secret, {
			expiresIn: "1h",
			algorithm: "HS256",
		});
	});

	describe("generateToken", () => {
		it("should generate a valid JWT token", () => {
			const payload: TestPayload = {
				userId: 123,
				email: "test@example.com",
			};

			const token = tokenUtil.generateToken(payload);

			expect(token).toBeDefined();
			expect(typeof token).toBe("string");

			const decoded = jwt.verify(token, secret) as TestPayload;
			expect(decoded.userId).toBe(123);
			expect(decoded.email).toBe("test@example.com");
		});

		it("should generate token with HS256 algorithm", () => {
			const payload: TestPayload = {
				userId: 456,
				email: "another@example.com",
			};

			const token = tokenUtil.generateToken(payload);
			const decoded = jwt.decode(token, { complete: true });

			expect(decoded?.header.alg).toBe("HS256");
		});

		it("should generate token with 1h expiration", () => {
			const payload: TestPayload = {
				userId: 789,
				email: "expiry@example.com",
			};

			const token = tokenUtil.generateToken(payload);
			const decoded = jwt.decode(token) as { exp: number; iat: number };

			expect(decoded.exp - decoded.iat).toBe(3600);
		});
	});

	describe("createSandboxServiceToken", () => {
		let originalSecret: string | undefined;
		let originalAlgorithm: string | undefined;

		beforeEach(() => {
			originalSecret = process.env.TOKEN_SECRET;
			originalAlgorithm = process.env.TOKEN_ALGORITHM;
		});

		afterEach(() => {
			if (originalSecret === undefined) {
				delete process.env.TOKEN_SECRET;
			} else {
				process.env.TOKEN_SECRET = originalSecret;
			}
			if (originalAlgorithm === undefined) {
				delete process.env.TOKEN_ALGORITHM;
			} else {
				process.env.TOKEN_ALGORITHM = originalAlgorithm;
			}
			resetConfig();
		});

		it("creates a sandbox token with expected claims", () => {
			process.env.TOKEN_SECRET = "sandbox-secret";
			process.env.TOKEN_ALGORITHM = "HS256";
			resetConfig();

			const token = createSandboxServiceToken({
				userId: 42,
				email: "sandbox@example.com",
				name: "Sandbox Runner",
				picture: undefined,
				spaceSlug: "space-alpha",
				ttl: "15m",
			});
			const payload = jwt.verify(token, "sandbox-secret") as {
				userId: number;
				email: string;
				name: string;
				tokenType: string;
				spaceSlug: string;
				exp: number;
				iat: number;
			};

			expect(payload.userId).toBe(42);
			expect(payload.email).toBe("sandbox@example.com");
			expect(payload.name).toBe("Sandbox Runner");
			expect(payload.tokenType).toBe("sandbox-service");
			expect(payload.spaceSlug).toBe("space-alpha");
			expect(payload.exp - payload.iat).toBe(900);
		});

		it("uses 30 minute ttl by default", () => {
			process.env.TOKEN_SECRET = "sandbox-secret-default";
			process.env.TOKEN_ALGORITHM = "HS256";
			resetConfig();

			const token = createSandboxServiceToken({
				userId: 7,
				email: "default@example.com",
				name: "Default TTL",
				picture: undefined,
				spaceSlug: "space-default",
			});
			const payload = jwt.verify(token, "sandbox-secret-default") as { exp: number; iat: number };

			expect(payload.exp - payload.iat).toBe(1800);
		});
	});

	describe("decodePayload", () => {
		it("should decode a valid token from cookie", () => {
			const payload: TestPayload = {
				userId: 123,
				email: "test@example.com",
			};

			const token = tokenUtil.generateToken(payload);
			const req: RequestWithCookies = {
				headers: {},
				cookies: {
					authToken: token,
				},
			};

			const decoded = tokenUtil.decodePayload(req as never);

			expect(decoded).toBeDefined();
			expect(decoded?.userId).toBe(123);
			expect(decoded?.email).toBe("test@example.com");
		});

		it("should return undefined when cookie is missing", () => {
			const req: RequestWithCookies = {
				headers: {},
				cookies: {},
			};

			const decoded = tokenUtil.decodePayload(req as never);

			expect(decoded).toBeUndefined();
		});

		it("should return undefined for invalid token in cookie", () => {
			const req: RequestWithCookies = {
				headers: {},
				cookies: {
					authToken: "invalid-token",
				},
			};

			const decoded = tokenUtil.decodePayload(req as never);

			expect(decoded).toBeUndefined();
		});

		it("should return undefined for token signed with different secret", () => {
			const payload: TestPayload = {
				userId: 123,
				email: "test@example.com",
			};

			const token = jwt.sign(payload, "different-secret");
			const req: RequestWithCookies = {
				headers: {},
				cookies: {
					authToken: token,
				},
			};

			const decoded = tokenUtil.decodePayload(req as never);

			expect(decoded).toBeUndefined();
		});

		it("should return undefined for expired token", () => {
			const payload: TestPayload = {
				userId: 123,
				email: "test@example.com",
			};

			const token = jwt.sign(payload, secret, { expiresIn: "0s" });
			const req: RequestWithCookies = {
				headers: {},
				cookies: {
					authToken: token,
				},
			};

			const decoded = tokenUtil.decodePayload(req as never);

			expect(decoded).toBeUndefined();
		});

		it("should decode a valid token from Authorization header", () => {
			const payload: TestPayload = {
				userId: 456,
				email: "bearer@example.com",
			};

			const token = tokenUtil.generateToken(payload);
			const req: RequestWithCookies = {
				headers: {
					authorization: `Bearer ${token}`,
				},
			};

			const decoded = tokenUtil.decodePayload(req as never);

			expect(decoded).toBeDefined();
			expect(decoded?.userId).toBe(456);
			expect(decoded?.email).toBe("bearer@example.com");
		});

		it("should decode a valid token from query param for SSE stream", () => {
			const payload: TestPayload = {
				userId: 321,
				email: "sse@example.com",
			};

			const token = tokenUtil.generateToken(payload);
			const req: RequestWithCookies = {
				headers: {
					accept: "text/event-stream",
				},
				query: {
					token,
				},
				path: "/api/agent/convos/1/stream",
			};

			const decoded = tokenUtil.decodePayload(req as never);

			expect(decoded).toBeDefined();
			expect(decoded?.userId).toBe(321);
			expect(decoded?.email).toBe("sse@example.com");
		});

		it("should not use query token when not SSE or stream path", () => {
			const payload: TestPayload = {
				userId: 999,
				email: "query@example.com",
			};

			const token = tokenUtil.generateToken(payload);
			const req: RequestWithCookies = {
				headers: {
					accept: "text/html", // Not SSE
				},
				query: {
					token,
				},
				path: "/api/users", // Not a stream path
			};

			// Should return undefined because query token is only used for SSE/stream
			const decoded = tokenUtil.decodePayload(req as never);

			expect(decoded).toBeUndefined();
		});

		it("should use query token when path ends with /stream", () => {
			const payload: TestPayload = {
				userId: 888,
				email: "stream@example.com",
			};

			const token = tokenUtil.generateToken(payload);
			const req: RequestWithCookies = {
				headers: {
					accept: "text/html", // Not SSE but path is /stream
				},
				query: {
					token,
				},
				path: "/api/convos/1/stream", // Stream path
			};

			const decoded = tokenUtil.decodePayload(req as never);

			expect(decoded).toBeDefined();
			expect(decoded?.userId).toBe(888);
		});

		it("should prioritize Authorization header over cookie", () => {
			const headerPayload: TestPayload = {
				userId: 111,
				email: "header@example.com",
			};
			const cookiePayload: TestPayload = {
				userId: 222,
				email: "cookie@example.com",
			};

			const headerToken = tokenUtil.generateToken(headerPayload);
			const cookieToken = tokenUtil.generateToken(cookiePayload);

			const req: RequestWithCookies = {
				headers: {
					authorization: `Bearer ${headerToken}`,
				},
				cookies: {
					authToken: cookieToken,
				},
			};

			const decoded = tokenUtil.decodePayload(req as never);

			expect(decoded).toBeDefined();
			expect(decoded?.userId).toBe(111);
			expect(decoded?.email).toBe("header@example.com");
		});

		it("should return undefined for Authorization header without Bearer prefix", () => {
			const payload: TestPayload = {
				userId: 123,
				email: "test@example.com",
			};

			const token = tokenUtil.generateToken(payload);
			const req: RequestWithCookies = {
				headers: {
					authorization: token, // Missing "Bearer " prefix
				},
			};

			const decoded = tokenUtil.decodePayload(req as never);

			expect(decoded).toBeUndefined();
		});

		it("should return undefined for invalid token in Authorization header", () => {
			const req: RequestWithCookies = {
				headers: {
					authorization: "Bearer invalid-token",
				},
			};

			const decoded = tokenUtil.decodePayload(req as never);

			expect(decoded).toBeUndefined();
		});
	});

	describe("decodePayloadFromToken", () => {
		it("should decode a valid token directly", () => {
			const payload: TestPayload = {
				userId: 123,
				email: "test@example.com",
			};

			const token = tokenUtil.generateToken(payload);
			const decoded = tokenUtil.decodePayloadFromToken(token);

			expect(decoded).toBeDefined();
			expect(decoded?.userId).toBe(123);
			expect(decoded?.email).toBe("test@example.com");
		});

		it("should return undefined for invalid token", () => {
			const decoded = tokenUtil.decodePayloadFromToken("invalid-token");

			expect(decoded).toBeUndefined();
		});

		it("should return undefined for token signed with different secret", () => {
			const payload: TestPayload = {
				userId: 123,
				email: "test@example.com",
			};

			const token = jwt.sign(payload, "different-secret");
			const decoded = tokenUtil.decodePayloadFromToken(token);

			expect(decoded).toBeUndefined();
		});

		it("should return undefined for expired token", () => {
			const payload: TestPayload = {
				userId: 123,
				email: "test@example.com",
			};

			const token = jwt.sign(payload, secret, { expiresIn: "0s" });
			const decoded = tokenUtil.decodePayloadFromToken(token);

			expect(decoded).toBeUndefined();
		});

		it("should return undefined for malformed JWT", () => {
			const decoded = tokenUtil.decodePayloadFromToken("abc.def.ghi");

			expect(decoded).toBeUndefined();
		});

		it("should return undefined for empty string", () => {
			const decoded = tokenUtil.decodePayloadFromToken("");

			expect(decoded).toBeUndefined();
		});
	});

	describe("createJwtUtilFromEnv", () => {
		let originalSecret: string | undefined;
		let originalExpiresIn: string | undefined;
		let originalAlgorithm: string | undefined;

		beforeEach(() => {
			originalSecret = process.env.TOKEN_SECRET;
			originalExpiresIn = process.env.TOKEN_EXPIRES_IN;
			originalAlgorithm = process.env.TOKEN_ALGORITHM;
		});

		afterEach(() => {
			process.env.TOKEN_SECRET = originalSecret;
			process.env.TOKEN_EXPIRES_IN = originalExpiresIn;
			process.env.TOKEN_ALGORITHM = originalAlgorithm;
			resetConfig();
		});

		it("should create JwtUtil from environment variables", () => {
			process.env.TOKEN_SECRET = "env-secret";
			process.env.TOKEN_EXPIRES_IN = "2h";
			process.env.TOKEN_ALGORITHM = "HS384";
			resetConfig();

			const util = createTokenUtilFromEnv<TestPayload>();
			const payload: TestPayload = {
				userId: 999,
				email: "env@example.com",
			};

			const token = util.generateToken(payload);
			const decoded = jwt.decode(token, { complete: true });

			expect(decoded?.header.alg).toBe("HS384");
			expect(decoded?.payload).toMatchObject({ userId: 999, email: "env@example.com" });
		});

		it("should throw error when TOKEN_SECRET is missing", () => {
			delete process.env.TOKEN_SECRET;
			process.env.TOKEN_EXPIRES_IN = "1h";
			process.env.TOKEN_ALGORITHM = "HS256";
			resetConfig();

			expect(() => {
				const util = createTokenUtilFromEnv<TestPayload>();
				util.generateToken({ userId: 1, email: "test@example.com" });
			}).toThrow();
		});

		it("should use default TOKEN_EXPIRES_IN when not provided", () => {
			process.env.TOKEN_SECRET = "secret";
			delete process.env.TOKEN_EXPIRES_IN;
			process.env.TOKEN_ALGORITHM = "HS256";
			resetConfig();

			const util = createTokenUtilFromEnv<TestPayload>();
			const token = util.generateToken({ userId: 1, email: "test@example.com" });
			const decoded = jwt.decode(token) as { exp: number; iat: number };

			// Default is "2h" = 2 hours = 7200 seconds
			expect(decoded.exp - decoded.iat).toBe(7200);
		});

		it("should use default TOKEN_ALGORITHM when not provided", () => {
			process.env.TOKEN_SECRET = "secret";
			process.env.TOKEN_EXPIRES_IN = "1h";
			delete process.env.TOKEN_ALGORITHM;
			resetConfig();

			const util = createTokenUtilFromEnv<TestPayload>();
			const token = util.generateToken({ userId: 1, email: "test@example.com" });
			const decoded = jwt.decode(token, { complete: true });

			// Default is "HS256"
			expect(decoded?.header.alg).toBe("HS256");
		});

		it("should decode payload using config token secret", () => {
			process.env.TOKEN_SECRET = "env-secret-for-decode";
			process.env.TOKEN_EXPIRES_IN = "1h";
			process.env.TOKEN_ALGORITHM = "HS256";
			resetConfig();

			const util = createTokenUtilFromEnv<TestPayload>();
			const payload: TestPayload = {
				userId: 999,
				email: "env@example.com",
			};
			const token = util.generateToken(payload);

			const req: RequestWithCookies = {
				headers: {},
				cookies: {
					authToken: token,
				},
			};

			const decoded = util.decodePayload(req as never);

			expect(decoded).toBeDefined();
			expect(decoded?.userId).toBe(999);
			expect(decoded?.email).toBe("env@example.com");
		});

		it("should decode payload from token directly using config secret", () => {
			process.env.TOKEN_SECRET = "env-secret-for-direct-decode";
			process.env.TOKEN_EXPIRES_IN = "1h";
			process.env.TOKEN_ALGORITHM = "HS256";
			resetConfig();

			const util = createTokenUtilFromEnv<TestPayload>();
			const payload: TestPayload = {
				userId: 777,
				email: "direct@example.com",
			};
			const token = util.generateToken(payload);

			const decoded = util.decodePayloadFromToken(token);

			expect(decoded).toBeDefined();
			expect(decoded?.userId).toBe(777);
			expect(decoded?.email).toBe("direct@example.com");
		});
	});

	describe("generateToken with different options", () => {
		it("should support different algorithms", () => {
			const util = createTokenUtil<TestPayload>("secret", {
				expiresIn: "30m",
				algorithm: "HS512",
			});

			const token = util.generateToken({ userId: 1, email: "test@example.com" });
			const decoded = jwt.decode(token, { complete: true });

			expect(decoded?.header.alg).toBe("HS512");
		});

		it("should support different expiration times", () => {
			const util = createTokenUtil<TestPayload>("secret", {
				expiresIn: "15m",
				algorithm: "HS256",
			});

			const token = util.generateToken({ userId: 1, email: "test@example.com" });
			const decoded = jwt.decode(token) as { exp: number; iat: number };

			expect(decoded.exp - decoded.iat).toBe(900); // 15 minutes = 900 seconds
		});
	});

	describe("Global TokenUtil singleton", () => {
		it("should set and get global token util", () => {
			const util = createTokenUtil<UserInfo>("test-secret-global", {
				expiresIn: "1h",
				algorithm: "HS256",
			});

			setGlobalTokenUtil(util);
			const retrieved = getGlobalTokenUtil();

			expect(retrieved).toBe(util);
		});

		it("should return the global token util instance", () => {
			const util = createTokenUtil<UserInfo>("test-secret-2", {
				expiresIn: "2h",
				algorithm: "HS256",
			});

			setGlobalTokenUtil(util);
			const retrieved = getGlobalTokenUtil();

			expect(retrieved).not.toBeNull();
			expect(retrieved).toBeDefined();

			// Test that it works by generating and decoding a token
			const payload: UserInfo = {
				userId: 999,
				email: "global@example.com",
				name: "Global User",
				picture: undefined,
			};
			const token = retrieved?.generateToken(payload);
			expect(token).toBeDefined();
		});

		it("should allow overwriting the global token util", () => {
			const util1 = createTokenUtil<UserInfo>("secret-1", {
				expiresIn: "1h",
				algorithm: "HS256",
			});
			const util2 = createTokenUtil<UserInfo>("secret-2", {
				expiresIn: "2h",
				algorithm: "HS256",
			});

			setGlobalTokenUtil(util1);
			expect(getGlobalTokenUtil()).toBe(util1);

			setGlobalTokenUtil(util2);
			expect(getGlobalTokenUtil()).toBe(util2);
			expect(getGlobalTokenUtil()).not.toBe(util1);
		});
	});

	describe("decodePayloadFromToken", () => {
		it("should decode valid token directly", () => {
			const payload: TestPayload = {
				userId: 123,
				email: "test@example.com",
			};

			const token = tokenUtil.generateToken(payload);
			const decoded = tokenUtil.decodePayloadFromToken(token);

			expect(decoded).toBeDefined();
			expect(decoded?.userId).toBe(123);
			expect(decoded?.email).toBe("test@example.com");
		});

		it("should return undefined for invalid token string", () => {
			const decoded = tokenUtil.decodePayloadFromToken("invalid-token");
			expect(decoded).toBeUndefined();
		});

		it("should return undefined for malformed token", () => {
			const decoded = tokenUtil.decodePayloadFromToken("not.a.valid.jwt.token");
			expect(decoded).toBeUndefined();
		});

		it("should return undefined for token with wrong secret", () => {
			const wrongUtil = createTokenUtil<TestPayload>("different-secret", {
				expiresIn: "1h",
				algorithm: "HS256",
			});
			const payload: TestPayload = {
				userId: 123,
				email: "test@example.com",
			};
			const token = wrongUtil.generateToken(payload);

			const decoded = tokenUtil.decodePayloadFromToken(token);
			expect(decoded).toBeUndefined();
		});

		it("should return undefined for expired token", () => {
			const expiredUtil = createTokenUtil<TestPayload>(secret, {
				expiresIn: "0s",
				algorithm: "HS256",
			});
			const payload: TestPayload = {
				userId: 1,
				email: "test@example.com",
			};
			const token = expiredUtil.generateToken(payload);

			const decoded = tokenUtil.decodePayloadFromToken(token);
			expect(decoded).toBeUndefined();
		});

		it("should handle tokens with different algorithms", () => {
			const hs512Util = createTokenUtil<TestPayload>(secret, {
				expiresIn: "1h",
				algorithm: "HS512",
			});
			const payload: TestPayload = {
				userId: 456,
				email: "hs512@example.com",
			};
			const token = hs512Util.generateToken(payload);

			const decoded = hs512Util.decodePayloadFromToken(token);
			expect(decoded).toBeDefined();
			expect(decoded?.userId).toBe(456);
			expect(decoded?.email).toBe("hs512@example.com");
		});

		it("should decode token generated from env config", () => {
			process.env.TOKEN_SECRET = "env-secret-for-decode-test";
			process.env.TOKEN_EXPIRES_IN = "30m";
			process.env.TOKEN_ALGORITHM = "HS256";
			resetConfig();

			const util = createTokenUtilFromEnv<TestPayload>();
			const payload: TestPayload = {
				userId: 777,
				email: "env-decode@example.com",
			};
			const token = util.generateToken(payload);

			const decoded = util.decodePayloadFromToken(token);
			expect(decoded).toBeDefined();
			expect(decoded?.userId).toBe(777);
			expect(decoded?.email).toBe("env-decode@example.com");
		});
	});
});
