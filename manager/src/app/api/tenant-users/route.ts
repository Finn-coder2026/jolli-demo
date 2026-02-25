import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/db/getDatabase";

/**
 * GET /api/tenant-users?email=<email>
 * Search for tenant users by email address.
 * Returns all tenant/org associations for the user.
 */
export const GET = requireAuth(async (request: NextRequest): Promise<NextResponse> => {
	try {
		const { searchParams } = new URL(request.url);
		const email = searchParams.get("email");

		if (!email || typeof email !== "string") {
			return NextResponse.json({ error: "Email parameter is required" }, { status: 400 });
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
		}

		const database = await getDatabase();
		const results = await database.userOrgDao.searchTenantUsersByEmail(email);

		return NextResponse.json({
			results: results.map(r => ({
				userId: r.userId,
				userName: r.userName,
				userEmail: r.userEmail,
				tenantId: r.tenantId,
				tenantName: r.tenantName,
				orgId: r.orgId,
				orgName: r.orgName,
				role: r.role,
				isActive: r.userIsActive,
				createdAt: r.createdAt,
			})),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error("Error searching tenant users:", message);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
});
