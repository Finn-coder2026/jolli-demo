import { type NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { env } from "@/lib/Config";
import { getDatabase } from "@/lib/db/getDatabase";
import type { UserRole } from "@/lib/db/models";

/**
 * GET /api/users
 * List all users. Requires SuperAdmin role.
 */
export const GET = requireSuperAdmin(async (): Promise<NextResponse> => {
	try {
		const database = await getDatabase();
		const users = await database.userDao.findAll();

		return NextResponse.json({
			users: users.map(user => ({
				id: user.id,
				email: user.email,
				name: user.name,
				picture: user.picture,
				role: user.role,
				isActive: user.isActive,
				createdAt: user.createdAt,
				updatedAt: user.updatedAt,
			})),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error("Error listing users:", message);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
});

/** Request body for creating a user */
interface CreateUserBody {
	email: string;
	name?: string;
	role?: UserRole;
}

/**
 * POST /api/users
 * Create a new user. Requires SuperAdmin role.
 */
export const POST = requireSuperAdmin(async (request: NextRequest): Promise<NextResponse> => {
	try {
		const body = (await request.json()) as CreateUserBody;

		// Validate required fields
		if (!body.email || typeof body.email !== "string") {
			return NextResponse.json({ error: "Email is required" }, { status: 400 });
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(body.email)) {
			return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
		}

		// Validate email matches admin pattern
		const adminPattern = env.ADMIN_EMAIL_PATTERN;
		if (adminPattern) {
			try {
				const regex = new RegExp(adminPattern);
				if (!regex.test(body.email)) {
					return NextResponse.json({ error: "Email does not match admin pattern" }, { status: 400 });
				}
			} catch {
				// Invalid regex pattern in config - skip validation
			}
		}

		// Validate role if provided
		const role = body.role ?? "user";
		if (role !== "super_admin" && role !== "user") {
			return NextResponse.json({ error: "Invalid role. Must be 'super_admin' or 'user'" }, { status: 400 });
		}

		const database = await getDatabase();

		// Check if user already exists
		const existingUser = await database.userDao.findByEmail(body.email);
		if (existingUser) {
			return NextResponse.json({ error: "User with this email already exists" }, { status: 409 });
		}

		// Create user
		const user = await database.userDao.create({
			email: body.email,
			name: body.name ?? null,
			role,
			isActive: true,
		});

		return NextResponse.json(
			{
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
			},
			{ status: 201 },
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error("Error creating user:", message);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
});
