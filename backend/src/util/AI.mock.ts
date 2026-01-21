import type { AI } from "./AI";
import { vi } from "vitest";

export function mockAI(): AI {
	return {
		generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
		generateEmbeddings: vi.fn().mockResolvedValue([
			[0.1, 0.2, 0.3],
			[0.4, 0.5, 0.6],
		]),
		streamChat: vi.fn(() => ({
			pipeUIMessageStreamToResponse: vi.fn(res => {
				res.status(200).json({ status: "success" });
			}),
		})),
	} as unknown as AI;
}
