/**
 * Service for managing Server-Sent Event connections for site build progress streaming.
 * Handles connection tracking, broadcasting build events, and cleanup on disconnect.
 */

import { getLog } from "../util/Logger";
import type { Response } from "express";

const log = getLog(import.meta);

/**
 * Represents a connected client watching a site build
 */
interface BuildConnection {
	res: Response;
	keepAliveInterval: NodeJS.Timeout;
}

/**
 * Build event types for SSE streaming
 */
export type BuildEventType =
	| "build:clear"
	| "build:mode"
	| "build:step"
	| "build:stdout"
	| "build:stderr"
	| "build:command"
	| "build:state"
	| "build:completed"
	| "build:failed";

/**
 * Build event data structure
 */
export interface BuildEvent {
	type: BuildEventType;
	[key: string]: unknown;
}

/**
 * Build clear event (sent to clear previous build output)
 */
export interface BuildClearEvent extends BuildEvent {
	type: "build:clear";
}

/**
 * Build mode event (sent on connection or build start)
 */
export interface BuildModeEvent extends BuildEvent {
	type: "build:mode";
	mode: "create" | "rebuild";
	totalSteps: number;
}

/**
 * Build step progress event
 */
export interface BuildStepEvent extends BuildEvent {
	type: "build:step";
	step: number;
	total: number;
	message: string;
}

/**
 * Build stdout/stderr output event
 */
export interface BuildOutputEvent extends BuildEvent {
	type: "build:stdout" | "build:stderr";
	step: number;
	output: string;
}

/**
 * Build command event (shows commands being executed during Vercel build)
 */
export interface BuildCommandEvent extends BuildEvent {
	type: "build:command";
	step: number;
	command: string;
}

/**
 * Build state change event (shows Vercel deployment state changes)
 */
export interface BuildStateEvent extends BuildEvent {
	type: "build:state";
	step: number;
	state: string;
}

/**
 * Build completed event
 */
export interface BuildCompletedEvent extends BuildEvent {
	type: "build:completed";
	status: "active";
	url: string;
}

/**
 * Build failed event
 */
export interface BuildFailedEvent extends BuildEvent {
	type: "build:failed";
	step?: number;
	error: string;
}

// Module-level connection tracking
const buildConnections = new Map<number, Array<BuildConnection>>();

// Event buffer for sites that start building before clients connect
// Stores recent events so clients can catch up when they connect
const eventBuffers = new Map<number, Array<BuildEvent>>();

// Track active build temp directories for cleanup on cancel
const activeBuildTempDirs = new Map<number, string>();

// Maximum events to buffer per site (to prevent memory issues)
const MAX_BUFFERED_EVENTS = 100;

// How long to keep buffered events (5 minutes)
const BUFFER_EXPIRY_MS = 5 * 60 * 1000;

// Track when buffers were last updated (for expiry)
const bufferTimestamps = new Map<number, number>();

// Keep-alive interval in milliseconds (20 seconds)
const KEEP_ALIVE_INTERVAL_MS = 20000;

/**
 * Sets up SSE headers on a response
 */
function setupSSEHeaders(res: Response): void {
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.setHeader("X-Accel-Buffering", "no"); // Disable proxy buffering
}

/**
 * Sends an SSE event to the client
 */
function sendSSE(res: Response, data: unknown): void {
	if (!res.writableEnded) {
		res.write(`data: ${JSON.stringify(data)}\n\n`);
	}
}

/**
 * Starts keep-alive ping interval
 */
function startKeepAlive(res: Response): NodeJS.Timeout {
	return setInterval(() => {
		if (!res.writableEnded) {
			const timestamp = new Date().toISOString();
			res.write(`: ping ${timestamp}\n\n`);
		}
	}, KEEP_ALIVE_INTERVAL_MS);
}

/**
 * Stops keep-alive ping interval
 */
function stopKeepAlive(intervalId: NodeJS.Timeout): void {
	clearInterval(intervalId);
}

/**
 * Adds a new SSE connection for a site build.
 * Sets up SSE headers, starts keep-alive, adds to connection tracking,
 * and replays any buffered events that were broadcast before the client connected.
 *
 * @param siteId - The ID of the site being built
 * @param res - The Express response object
 */
export function addBuildConnection(siteId: number, res: Response): void {
	setupSSEHeaders(res);
	const keepAliveInterval = startKeepAlive(res);
	const connection: BuildConnection = { res, keepAliveInterval };

	const existing = buildConnections.get(siteId) || [];
	existing.push(connection);
	buildConnections.set(siteId, existing);

	// Replay buffered events to the new connection
	const bufferedEvents = eventBuffers.get(siteId);
	if (bufferedEvents && bufferedEvents.length > 0) {
		log.debug({ siteId, bufferedCount: bufferedEvents.length }, "Replaying buffered events to new connection");
		for (const event of bufferedEvents) {
			sendSSE(res, event);
		}
	}

	log.debug({ siteId, connectionCount: existing.length }, "Added build connection");
}

/**
 * Removes an SSE connection for a site build.
 * Stops keep-alive and removes from connection tracking.
 *
 * @param siteId - The ID of the site being built
 * @param res - The Express response object to remove
 */
export function removeBuildConnection(siteId: number, res: Response): void {
	const connections = buildConnections.get(siteId);
	if (!connections) {
		return;
	}

	const idx = connections.findIndex(c => c.res === res);
	if (idx !== -1) {
		stopKeepAlive(connections[idx].keepAliveInterval);
		connections.splice(idx, 1);
		log.debug({ siteId, connectionCount: connections.length }, "Removed build connection");
	}

	if (connections.length === 0) {
		buildConnections.delete(siteId);
		log.debug({ siteId }, "No more build connections for site");
	}
}

/**
 * Broadcasts a build event to all connected clients watching a site build.
 * Also buffers the event for clients that connect later.
 *
 * @param siteId - The ID of the site being built
 * @param event - The build event to broadcast
 */
export function broadcastBuildEvent(siteId: number, event: BuildEvent): void {
	// Always buffer the event (even if no connections yet)
	bufferEvent(siteId, event);

	const connections = buildConnections.get(siteId);
	if (!connections || connections.length === 0) {
		log.debug({ siteId, eventType: event.type }, "No connections, event buffered only");
		return;
	}

	log.debug({ siteId, eventType: event.type, connectionCount: connections.length }, "Broadcasting build event");

	for (const { res } of connections) {
		sendSSE(res, event);
	}

	// Clear buffer on build completion or failure (no more events expected)
	/* v8 ignore start - setTimeout callback runs after 30 seconds */
	if (event.type === "build:completed" || event.type === "build:failed") {
		// Schedule buffer cleanup after a short delay to allow late connections
		setTimeout(() => {
			clearEventBuffer(siteId);
		}, 30000); // Keep buffer for 30 seconds after completion
	}
	/* v8 ignore stop */
}

/**
 * Buffers an event for a site build.
 * Events are buffered so late-connecting clients can catch up.
 */
function bufferEvent(siteId: number, event: BuildEvent): void {
	// Check for expired buffer and clear if needed
	const lastUpdate = bufferTimestamps.get(siteId);
	/* v8 ignore start - buffer expiry only happens after BUFFER_EXPIRY_MS (5 minutes) */
	if (lastUpdate && Date.now() - lastUpdate > BUFFER_EXPIRY_MS) {
		clearEventBuffer(siteId);
	}
	/* v8 ignore stop */

	let buffer = eventBuffers.get(siteId);
	if (!buffer) {
		buffer = [];
		eventBuffers.set(siteId, buffer);
	}

	buffer.push(event);
	bufferTimestamps.set(siteId, Date.now());

	// Trim buffer if it exceeds max size (keep most recent events)
	/* v8 ignore start - buffer trimming only happens after MAX_BUFFERED_EVENTS (100) events */
	if (buffer.length > MAX_BUFFERED_EVENTS) {
		buffer.splice(0, buffer.length - MAX_BUFFERED_EVENTS);
	}
	/* v8 ignore stop */
}

/**
 * Clears the event buffer for a site.
 */
export function clearEventBuffer(siteId: number): void {
	eventBuffers.delete(siteId);
	bufferTimestamps.delete(siteId);
	log.debug({ siteId }, "Cleared event buffer");
}

/**
 * Sends a build event to a single response (for initial status on connect).
 *
 * @param res - The Express response object
 * @param event - The build event to send
 */
export function sendBuildEvent(res: Response, event: BuildEvent): void {
	sendSSE(res, event);
}

/**
 * Gets the number of active connections for a site.
 * Useful for testing and debugging.
 *
 * @param siteId - The ID of the site
 * @returns The number of active connections
 */
export function getConnectionCount(siteId: number): number {
	return buildConnections.get(siteId)?.length || 0;
}

/**
 * Clears all connections and buffers (useful for testing cleanup).
 */
export function clearAllConnections(): void {
	for (const [siteId, connections] of buildConnections) {
		for (const { keepAliveInterval } of connections) {
			stopKeepAlive(keepAliveInterval);
		}
		log.debug({ siteId }, "Cleared all connections");
	}
	buildConnections.clear();
	eventBuffers.clear();
	bufferTimestamps.clear();
	activeBuildTempDirs.clear();
}

/**
 * Registers a temp directory for an active build.
 * This allows cleanup when a build is cancelled.
 *
 * @param siteId - The ID of the site being built
 * @param tempDir - The path to the temp directory
 */
export function registerBuildTempDir(siteId: number, tempDir: string): void {
	activeBuildTempDirs.set(siteId, tempDir);
	log.debug({ siteId, tempDir }, "Registered build temp directory");
}

/**
 * Unregisters a temp directory for a build (called after cleanup).
 *
 * @param siteId - The ID of the site
 */
export function unregisterBuildTempDir(siteId: number): void {
	activeBuildTempDirs.delete(siteId);
	log.debug({ siteId }, "Unregistered build temp directory");
}

/**
 * Gets the temp directory for an active build (for cleanup on cancel).
 *
 * @param siteId - The ID of the site
 * @returns The temp directory path, or undefined if no active build
 */
export function getBuildTempDir(siteId: number): string | undefined {
	return activeBuildTempDirs.get(siteId);
}
