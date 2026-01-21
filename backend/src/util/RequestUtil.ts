import type express from "express";

/**
 * Gets the forwarded host from the X-Forwarded-Host header.
 * @param req the current request.
 */
export function getForwardedHost(req: express.Request): string | undefined {
	const forwardedHost = req.headers["x-forwarded-host"];
	return typeof forwardedHost === "string" ? forwardedHost : undefined;
}

/**
 * Gets the request host from X-Forwarded-Host or Host header.
 */
export function getRequestHost(req: express.Request): string | undefined {
	return getForwardedHost(req) ?? req.headers.host;
}

/**
 * Gets the request hostname (without port) from X-Forwarded-Host or Host header.
 */
export function getRequestHostname(req: express.Request): string | undefined {
	const host = getRequestHost(req);
	return host?.split(":")[0];
}

/**
 * Gets the forwarded protocol from the X-Forwarded-Proto header.
 * @param req the current request.
 */
export function getForwardedProto(req: express.Request): string | undefined {
	const forwardedHost = req.headers["x-forwarded-proto"];
	return typeof forwardedHost === "string" ? forwardedHost : undefined;
}

/**
 * Gets the request protocol from X-Forwarded-Proto or req.protocol.
 */
export function getRequestProtocol(req: express.Request): string {
	return getForwardedProto(req) ?? req.protocol;
}
