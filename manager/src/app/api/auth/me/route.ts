import { type NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { getDatabase } from "@/lib/db/getDatabase";

/**
 * GET /api/auth/me
 * Returns the current authenticated user's information.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
	const requestUser = getUserFromRequest(request);

	if (!requestUser) {
		return unauthorizedResponse();
	}

	try {
		const database = await getDatabase();
		const user = await database.userDao.findById(requestUser.userId);

		if (!user) {
			return unauthorizedResponse("User not found");
		}

		if (!user.isActive) {
			return unauthorizedResponse("User is inactive");
		}

		return NextResponse.json({
			id: user.id,
			email: user.email,
			name: user.name,
			picture: user.picture,
			role: user.role,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error("Error fetching user:", message);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
