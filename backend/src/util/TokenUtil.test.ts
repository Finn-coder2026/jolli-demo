import { resetConfig } from "../config/Config";
import { createTokenUtil, createTokenUtilFromEnv, type TokenUtil } from "./TokenUtil";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface RequestWithCookies {
	cookies?: Record<string, string>;
	headers?: Record<string, string>;
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
});
