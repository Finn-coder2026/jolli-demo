import { type NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, getUserFromRequest, isSuperAdmin, unauthorizedResponse } from "@/lib/auth";
import { getDatabase } from "@/lib/db/getDatabase";
import type { UserRole } from "@/lib/db/models";

interface RouteContext {
	params: Promise<{ userId: string }>;
}

/**
 * GET /api/users/[userId]
 * Get a specific user by ID. Requires SuperAdmin role.
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
	const requestUser = getUserFromRequest(request);
	if (!requestUser) {
		return unauthorizedResponse();
	}
	if (!isSuperAdmin(requestUser.role)) {
		return forbiddenResponse("SuperAdmin access required");
	}

	try {
		const { userId } = await context.params;
		const id = Number.parseInt(userId, 10);

		if (Number.isNaN(id)) {
			return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
		}

		const database = await getDatabase();
		const user = await database.userDao.findById(id);

		if (!user) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		return NextResponse.json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				picture: user.picture,
				role: user.role,
				isActive: user.isActive,
				createdAt: user.createdAt,
				updatedAt: user.updatedAt,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error("Error fetching user:", message);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/** Request body for updating a user */
interface UpdateUserBody {
	name?: string | null;
	role?: UserRole;
	isActive?: boolean;
}

/**
 * PATCH /api/users/[userId]
 * Update a user's role or active status. Requires SuperAdmin role.
 */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
	const currentUser = getUserFromRequest(request);
	if (!currentUser) {
		return unauthorizedResponse();
	}
	if (!isSuperAdmin(currentUser.role)) {
		return forbiddenResponse("SuperAdmin access required");
	}

	try {
		const { userId } = await context.params;
		const id = Number.parseInt(userId, 10);

		if (Number.isNaN(id)) {
			return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
		}

		const database = await getDatabase();
		const user = await database.userDao.findById(id);

		if (!user) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		const body = (await request.json()) as UpdateUserBody;

		// Validate role if provided
		if (body.role !== undefined && body.role !== "super_admin" && body.role !== "user") {
			return NextResponse.json({ error: "Invalid role. Must be 'super_admin' or 'user'" }, { status: 400 });
		}

		// Prevent self-demotion from super_admin
		if (currentUser.userId === id && body.role === "user" && user.role === "super_admin") {
			return NextResponse.json({ error: "Cannot demote yourself from SuperAdmin" }, { status: 400 });
		}

		// Prevent self-deactivation
		if (currentUser.userId === id && body.isActive === false) {
			return NextResponse.json({ error: "Cannot deactivate yourself" }, { status: 400 });
		}

		// Build update object
		const updates: { name?: string | null; role?: UserRole; isActive?: boolean } = {};
		if (body.name !== undefined) {
			updates.name = body.name;
		}
		if (body.role !== undefined) {
			updates.role = body.role;
		}
		if (body.isActive !== undefined) {
			updates.isActive = body.isActive;
		}

		const updatedUser = await database.userDao.update(id, updates);

		if (!updatedUser) {
			return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
		}

		return NextResponse.json({
			user: {
				id: updatedUser.id,
				email: updatedUser.email,
				name: updatedUser.name,
				picture: updatedUser.picture,
				role: updatedUser.role,
				isActive: updatedUser.isActive,
				createdAt: updatedUser.createdAt,
				updatedAt: updatedUser.updatedAt,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error("Error updating user:", message);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * DELETE /api/users/[userId]
 * Delete a user. Requires SuperAdmin role.
 */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
	const currentUser = getUserFromRequest(request);
	if (!currentUser) {
		return unauthorizedResponse();
	}
	if (!isSuperAdmin(currentUser.role)) {
		return forbiddenResponse("SuperAdmin access required");
	}

	try {
		const { userId } = await context.params;
		const id = Number.parseInt(userId, 10);

		if (Number.isNaN(id)) {
			return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
		}

		// Prevent self-deletion
		if (currentUser.userId === id) {
			return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
		}

		const database = await getDatabase();
		const user = await database.userDao.findById(id);

		if (!user) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Delete associated auth records first
		await database.authDao.deleteByUserId(id);

		// Delete user
		const deleted = await database.userDao.delete(id);

		if (!deleted) {
			return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error("Error deleting user:", message);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
