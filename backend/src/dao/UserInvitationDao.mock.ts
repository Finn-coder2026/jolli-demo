import type { UserInvitationDao } from "./UserInvitationDao";
import { vi } from "vitest";

export function mockUserInvitationDao(partial?: Partial<UserInvitationDao>): UserInvitationDao {
	return {
		findById: vi.fn(),
		findPendingByEmail: vi.fn(),
		findByVerificationId: vi.fn(),
		listPending: vi.fn(),
		listByInviter: vi.fn(),
		create: vi.fn(),
		updateVerificationId: vi.fn(),
		markAccepted: vi.fn(),
		markExpired: vi.fn(),
		expireOldInvitations: vi.fn(),
		delete: vi.fn(),
		countPending: vi.fn(),
		...partial,
	};
}
