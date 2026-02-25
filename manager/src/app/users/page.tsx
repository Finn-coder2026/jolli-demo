"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/lib/db/models";

/** User type from API */
interface User {
	id: number;
	email: string;
	name: string | null;
	picture: string | null;
	role: UserRole;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

/** Create user form data */
interface CreateUserForm {
	email: string;
	name: string;
	role: UserRole;
}

export default function UsersPage() {
	const { user: currentUser, isSuperAdmin, loading: authLoading } = useAuth();
	const [users, setUsers] = useState<Array<User>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [createForm, setCreateForm] = useState<CreateUserForm>({
		email: "",
		name: "",
		role: "user",
	});
	const [createError, setCreateError] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);

	const fetchUsers = useCallback(async () => {
		try {
			setLoading(true);
			const response = await fetch("/api/users");

			if (response.status === 403) {
				setError("You do not have permission to view users.");
				return;
			}

			if (!response.ok) {
				throw new Error("Failed to fetch users");
			}

			const data = (await response.json()) as { users: Array<User> };
			setUsers(data.users);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!authLoading && isSuperAdmin) {
			fetchUsers();
		}
	}, [authLoading, isSuperAdmin, fetchUsers]);

	const handleCreateUser = async (e: React.FormEvent) => {
		e.preventDefault();
		setCreating(true);
		setCreateError(null);

		try {
			const response = await fetch("/api/users", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(createForm),
			});

			if (!response.ok) {
				const data = (await response.json()) as { error?: string };
				throw new Error(data.error || "Failed to create user");
			}

			setShowCreateModal(false);
			setCreateForm({ email: "", name: "", role: "user" });
			fetchUsers();
		} catch (err) {
			setCreateError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setCreating(false);
		}
	};

	const handleUpdateRole = async (userId: number, newRole: UserRole) => {
		try {
			const response = await fetch(`/api/users/${userId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ role: newRole }),
			});

			if (!response.ok) {
				const data = (await response.json()) as { error?: string };
				throw new Error(data.error || "Failed to update user");
			}

			fetchUsers();
		} catch (err) {
			alert(err instanceof Error ? err.message : "Unknown error");
		}
	};

	const handleToggleActive = async (userId: number, isActive: boolean) => {
		try {
			const response = await fetch(`/api/users/${userId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isActive: !isActive }),
			});

			if (!response.ok) {
				const data = (await response.json()) as { error?: string };
				throw new Error(data.error || "Failed to update user");
			}

			fetchUsers();
		} catch (err) {
			alert(err instanceof Error ? err.message : "Unknown error");
		}
	};

	const handleDeleteUser = async (userId: number) => {
		if (!confirm("Are you sure you want to delete this user?")) {
			return;
		}

		try {
			const response = await fetch(`/api/users/${userId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				const data = (await response.json()) as { error?: string };
				throw new Error(data.error || "Failed to delete user");
			}

			fetchUsers();
		} catch (err) {
			alert(err instanceof Error ? err.message : "Unknown error");
		}
	};

	if (authLoading) {
		return <div style={styles.loading}>Loading...</div>;
	}

	if (!isSuperAdmin) {
		return (
			<div style={styles.container}>
				<div style={styles.error}>
					<h2>Access Denied</h2>
					<p>Only SuperAdmin users can access this page.</p>
				</div>
			</div>
		);
	}

	return (
		<div style={styles.container}>
			<div style={styles.header}>
				<h1 style={styles.title}>Manager Users</h1>
				<button type="button" onClick={() => setShowCreateModal(true)} style={styles.createButton}>
					Add User
				</button>
			</div>

			{error && <div style={styles.errorBanner}>{error}</div>}

			{loading ? (
				<div style={styles.loading}>Loading users...</div>
			) : (
				<table style={styles.table}>
					<thead>
						<tr>
							<th style={styles.th}>User</th>
							<th style={styles.th}>Role</th>
							<th style={styles.th}>Status</th>
							<th style={styles.th}>Created</th>
							<th style={styles.th}>Actions</th>
						</tr>
					</thead>
					<tbody>
						{users.map(user => (
							<tr key={user.id} style={styles.tr}>
								<td style={styles.td}>
									<div style={styles.userCell}>
										{user.picture && (
											<img
												src={user.picture}
												alt={user.name || user.email}
												style={styles.avatar}
											/>
										)}
										<div>
											<div style={styles.userName}>{user.name || "No name"}</div>
											<div style={styles.userEmail}>{user.email}</div>
										</div>
									</div>
								</td>
								<td style={styles.td}>
									<select
										value={user.role}
										onChange={e => handleUpdateRole(user.id, e.target.value as UserRole)}
										disabled={user.id === currentUser?.id}
										style={styles.select}
									>
										<option value="super_admin">SuperAdmin</option>
										<option value="user">User (read-only)</option>
									</select>
								</td>
								<td style={styles.td}>
									<span
										style={{
											...styles.badge,
											backgroundColor: user.isActive ? "#dcfce7" : "#fee2e2",
											color: user.isActive ? "#166534" : "#dc2626",
										}}
									>
										{user.isActive ? "Active" : "Inactive"}
									</span>
								</td>
								<td style={styles.td}>{new Date(user.createdAt).toLocaleDateString()}</td>
								<td style={styles.td}>
									{user.id !== currentUser?.id && (
										<div style={styles.actions}>
											<button
												type="button"
												onClick={() => handleToggleActive(user.id, user.isActive)}
												style={{
													...(user.isActive
														? styles.deactivateButton
														: styles.activateButton),
													cursor: "pointer",
												}}
											>
												{user.isActive ? "Deactivate" : "Activate"}
											</button>
											<button
												type="button"
												onClick={() => handleDeleteUser(user.id)}
												style={{ ...styles.deleteButton, cursor: "pointer" }}
											>
												Delete
											</button>
										</div>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{/* Create User Modal */}
			{showCreateModal && (
				<div style={styles.modalOverlay}>
					<div style={styles.modal}>
						<h2 style={styles.modalTitle}>Add New User</h2>
						<form onSubmit={handleCreateUser}>
							{createError && <div style={styles.errorBanner}>{createError}</div>}

							<div style={styles.formGroup}>
								<label style={styles.label} htmlFor="email">
									Email
								</label>
								<input
									id="email"
									type="email"
									value={createForm.email}
									onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
									required
									style={styles.input}
								/>
							</div>

							<div style={styles.formGroup}>
								<label style={styles.label} htmlFor="name">
									Name (optional)
								</label>
								<input
									id="name"
									type="text"
									value={createForm.name}
									onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
									style={styles.input}
								/>
							</div>

							<div style={styles.formGroup}>
								<label style={styles.label} htmlFor="role">
									Role
								</label>
								<select
									id="role"
									value={createForm.role}
									onChange={e => setCreateForm({ ...createForm, role: e.target.value as UserRole })}
									style={styles.select}
								>
									<option value="user">User (read-only)</option>
									<option value="super_admin">SuperAdmin (Full access)</option>
								</select>
							</div>

							<div style={styles.modalActions}>
								<button
									type="button"
									onClick={() => setShowCreateModal(false)}
									style={styles.cancelButton}
								>
									Cancel
								</button>
								<button type="submit" disabled={creating} style={styles.submitButton}>
									{creating ? "Creating..." : "Create User"}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}

/** Inline styles */
const styles: Record<string, React.CSSProperties> = {
	container: {
		padding: "2rem",
		fontFamily: "system-ui, sans-serif",
	},
	header: {
		display: "flex",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 24,
	},
	title: {
		margin: 0,
		fontSize: 24,
		fontWeight: 600,
	},
	createButton: {
		padding: "8px 16px",
		backgroundColor: "#3b82f6",
		color: "white",
		border: "none",
		borderRadius: 6,
		cursor: "pointer",
		fontSize: 14,
		fontWeight: 500,
	},
	loading: {
		textAlign: "center",
		padding: 40,
		color: "#666",
	},
	error: {
		textAlign: "center",
		padding: 40,
	},
	errorBanner: {
		backgroundColor: "#fee2e2",
		color: "#dc2626",
		padding: 12,
		borderRadius: 6,
		marginBottom: 16,
		fontSize: 14,
	},
	table: {
		width: "100%",
		borderCollapse: "collapse",
		backgroundColor: "white",
	},
	th: {
		textAlign: "left",
		padding: 12,
		borderBottom: "1px solid #e5e7eb",
		fontSize: 12,
		fontWeight: 600,
		textTransform: "uppercase",
		color: "#6b7280",
	},
	tr: {
		borderBottom: "1px solid #e5e7eb",
	},
	td: {
		padding: 12,
		fontSize: 14,
	},
	userCell: {
		display: "flex",
		alignItems: "center",
		gap: 12,
	},
	avatar: {
		width: 36,
		height: 36,
		borderRadius: "50%",
	},
	userName: {
		fontWeight: 500,
	},
	userEmail: {
		fontSize: 12,
		color: "#6b7280",
	},
	select: {
		padding: "6px 8px",
		borderRadius: 4,
		border: "none",
		fontSize: 14,
		backgroundColor: "transparent",
		cursor: "pointer",
	},
	badge: {
		display: "inline-block",
		padding: "4px 8px",
		borderRadius: 9999,
		fontSize: 12,
		fontWeight: 500,
	},
	actions: {
		display: "flex",
		gap: 8,
	},
	activateButton: {
		padding: "4px 8px",
		fontSize: 12,
		border: "none",
		borderRadius: 4,
		backgroundColor: "#3b82f6",
		color: "white",
	},
	deactivateButton: {
		padding: "4px 8px",
		fontSize: 12,
		border: "none",
		borderRadius: 4,
		backgroundColor: "#dc2626",
		color: "white",
	},
	deleteButton: {
		padding: "4px 8px",
		fontSize: 12,
		border: "none",
		borderRadius: 4,
		backgroundColor: "#dc2626",
		color: "white",
	},
	modalOverlay: {
		position: "fixed",
		inset: 0,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		zIndex: 1000,
	},
	modal: {
		backgroundColor: "white",
		borderRadius: 8,
		padding: 24,
		width: 400,
		maxWidth: "90%",
	},
	modalTitle: {
		margin: 0,
		marginBottom: 16,
		fontSize: 18,
		fontWeight: 600,
	},
	formGroup: {
		marginBottom: 16,
	},
	label: {
		display: "block",
		marginBottom: 4,
		fontSize: 14,
		fontWeight: 500,
	},
	input: {
		width: "100%",
		padding: "8px 12px",
		borderRadius: 6,
		border: "1px solid #d1d5db",
		fontSize: 14,
		boxSizing: "border-box",
	},
	modalActions: {
		display: "flex",
		justifyContent: "flex-end",
		gap: 8,
		marginTop: 24,
	},
	cancelButton: {
		padding: "8px 16px",
		backgroundColor: "white",
		border: "1px solid #d1d5db",
		borderRadius: 6,
		cursor: "pointer",
		fontSize: 14,
	},
	submitButton: {
		padding: "8px 16px",
		backgroundColor: "#3b82f6",
		color: "white",
		border: "none",
		borderRadius: 6,
		cursor: "pointer",
		fontSize: 14,
		fontWeight: 500,
	},
};
