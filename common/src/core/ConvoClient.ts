import type { AddMessageRequest, Convo, CreateConvoRequest, UpdateConvoRequest } from "../types/Convo";
import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/convos";

export interface ConvoClient {
	/**
	 * Creates a new convo
	 */
	createConvo(data: CreateConvoRequest): Promise<Convo>;
	/**
	 * Get all convos for the current user
	 */
	listConvos(): Promise<Array<Convo>>;
	/**
	 * Gets a specific convo by ID
	 */
	findConvo(id: number): Promise<Convo | undefined>;
	/**
	 * Updates a convo (title or messages)
	 */
	updateConvo(id: number, data: UpdateConvoRequest): Promise<Convo>;
	/**
	 * Deletes a convo
	 */
	deleteConvo(id: number): Promise<void>;
	/**
	 * Add a message to a convo
	 */
	addMessage(id: number, message: AddMessageRequest): Promise<Convo>;
}

export function createConvoClient(baseUrl: string, auth: ClientAuth): ConvoClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;
	return {
		createConvo,
		listConvos,
		findConvo,
		updateConvo,
		deleteConvo,
		addMessage,
	};

	async function createConvo(data: CreateConvoRequest): Promise<Convo> {
		const response = await fetch(basePath, createRequest("POST", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to create convo: ${response.statusText}`);
		}

		return (await response.json()) as Convo;
	}

	async function listConvos(): Promise<Array<Convo>> {
		const response = await fetch(basePath, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to list convos: ${response.statusText}`);
		}

		return (await response.json()) as Array<Convo>;
	}

	async function findConvo(id: number): Promise<Convo> {
		const response = await fetch(`${basePath}/${id}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get convo: ${response.statusText}`);
		}

		return (await response.json()) as Convo;
	}

	async function updateConvo(id: number, data: UpdateConvoRequest): Promise<Convo> {
		const response = await fetch(`${basePath}/${id}`, createRequest("PATCH", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to update convo: ${response.statusText}`);
		}

		return (await response.json()) as Convo;
	}

	async function deleteConvo(id: number): Promise<void> {
		const response = await fetch(`${basePath}/${id}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to delete convo: ${response.statusText}`);
		}
	}

	async function addMessage(id: number, message: AddMessageRequest): Promise<Convo> {
		const response = await fetch(`${basePath}/${id}/messages`, createRequest("POST", message));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to add message: ${response.statusText}`);
		}

		return (await response.json()) as Convo;
	}
}
