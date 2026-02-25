import { Button } from "../components/ui/Button";
import { NativeSelect } from "../components/ui/NativeSelect";
import { Pagination } from "../components/ui/Pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { useClient } from "../contexts/ClientContext";
import { EditUserDialog } from "./users/EditUserDialog";
import { InviteUserDialog } from "./users/InviteUserDialog";
import { UserTable } from "./users/UserTable";
import type { ActiveUser, ArchivedUser, OrgUserRole, Role, UserInvitation } from "jolli-common";
import { UserPlus } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

type UserTab = "active" | "pending" | "archived";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 20;

interface UsersProps {
	/** The current logged-in user's ID, used to prevent self-actions */
	currentUserId: number;
}

/**
 * Users page component for managing organization users.
 * Displays three tabs: Active users, Pending invitations, and Archived users.
 * Each tab shows a paginated table with relevant actions.
 */
export function Users({ currentUserId }: UsersProps): ReactElement {
	const content = useIntlayer("users");
	const client = useClient();

	// Tab state
	const [activeTab, setActiveTab] = useState<UserTab>("active");

	// Pagination state
	const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
	const [currentPage, setCurrentPage] = useState(1);

	// Data state for each tab
	const [activeUsers, setActiveUsers] = useState<Array<ActiveUser>>([]);
	const [activeTotal, setActiveTotal] = useState(0);
	const [canEditRoles, setCanEditRoles] = useState(false);
	const [canManageUsers, setCanManageUsers] = useState(false);
	const [pendingInvitations, setPendingInvitations] = useState<Array<UserInvitation>>([]);
	const [pendingTotal, setPendingTotal] = useState(0);
	const [archivedUsers, setArchivedUsers] = useState<Array<ArchivedUser>>([]);
	const [archivedTotal, setArchivedTotal] = useState(0);

	// UI state
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
	const [editDialogOpen, setEditDialogOpen] = useState(false);
	const [userToEdit, setUserToEdit] = useState<ActiveUser | null>(null);

	// Config state for email pattern validation
	const [authorizedEmailPatterns, setAuthorizedEmailPatterns] = useState<string | undefined>();

	// Available roles loaded from the API
	const [roles, setRoles] = useState<Array<Role>>([]);

	// Load user management config and roles
	useEffect(() => {
		async function loadConfig(): Promise<void> {
			try {
				const config = await client.userManagement().getConfig();
				setAuthorizedEmailPatterns(config.authorizedEmailPatterns);
			} catch {
				// Config fetch failure is not critical - backend will still validate
				// Default to allowing all emails in the UI
				setAuthorizedEmailPatterns("*");
			}
		}

		async function loadRoles(): Promise<void> {
			try {
				const loadedRoles = await client.userManagement().listRoles();
				setRoles(loadedRoles);
				/* v8 ignore next 4 - fallback for role loading failures */
			} catch {
				// If roles fail to load, we'll fall back to an empty array
				// The component will use built-in role labels
				setRoles([]);
			}
		}

		loadConfig();
		loadRoles();
	}, [client]);

	// Load data based on active tab
	const loadData = useCallback(async () => {
		setLoading(true);
		setError(undefined);
		const offset = (currentPage - 1) * pageSize;

		try {
			switch (activeTab) {
				case "active": {
					const response = await client.userManagement().listActiveUsers(pageSize, offset);
					setActiveUsers(response.data);
					setActiveTotal(response.total);
					setCanEditRoles(response.canEditRoles);
					setCanManageUsers(response.canManageUsers);
					break;
				}
				case "pending": {
					const response = await client.userManagement().listPendingInvitations(pageSize, offset);
					setPendingInvitations(response.data);
					setPendingTotal(response.total);
					break;
				}
				case "archived": {
					const response = await client.userManagement().listArchivedUsers(pageSize, offset);
					setArchivedUsers(response.data);
					setArchivedTotal(response.total);
					break;
				}
			}
			/* v8 ignore next 3 - error handling for data loading failures */
		} catch (err) {
			setError(err instanceof Error ? err.message : content.errorLoadingUsers.value);
		} finally {
			setLoading(false);
		}
	}, [activeTab, currentPage, pageSize, client, content.errorLoadingUsers.value]);

	// Load data when tab, page, or page size changes
	useEffect(() => {
		loadData();
	}, [loadData]);

	// Reset to page 1 when changing tabs or page size
	function handleTabChange(tab: string): void {
		setActiveTab(tab as UserTab);
		setCurrentPage(1);
	}

	function handlePageSizeChange(event: React.ChangeEvent<HTMLSelectElement>): void {
		setPageSize(Number(event.target.value));
		setCurrentPage(1);
	}

	function handlePageChange(page: number): void {
		setCurrentPage(page);
	}

	// Action handlers
	async function handleInviteUser(email: string, role: OrgUserRole, name?: string): Promise<void> {
		await client.userManagement().inviteUser({ email, role, ...(name && { name }) });
		setInviteDialogOpen(false);
		// Refresh pending tab if we're on it, or switch to pending
		if (activeTab === "pending") {
			await loadData();
		} else {
			setActiveTab("pending");
			setCurrentPage(1);
		}
	}

	async function handleCancelInvitation(id: number): Promise<void> {
		try {
			await client.userManagement().cancelInvitation(id);
			await loadData();
			/* v8 ignore next 3 - error handling for cancellation failures */
		} catch (err) {
			setError(err instanceof Error ? err.message : content.errorCancellingInvitation.value);
		}
	}

	async function handleResendInvitation(id: number): Promise<void> {
		try {
			await client.userManagement().resendInvitation(id);
			await loadData();
			/* v8 ignore next 3 - error handling for resend failures */
		} catch (err) {
			setError(err instanceof Error ? err.message : content.errorResendingInvitation.value);
		}
	}

	async function handleDeactivateUser(userId: number): Promise<void> {
		try {
			await client.userManagement().deactivateUser(userId);
			await loadData();
			/* v8 ignore next 3 - error handling for deactivation failures */
		} catch (err) {
			setError(err instanceof Error ? err.message : content.errorDeactivatingUser.value);
		}
	}

	async function handleActivateUser(userId: number): Promise<void> {
		try {
			await client.userManagement().activateUser(userId);
			await loadData();
			/* v8 ignore next 3 - error handling for activation failures */
		} catch (err) {
			setError(err instanceof Error ? err.message : content.errorActivatingUser.value);
		}
	}

	async function handleDeleteUser(userId: number): Promise<void> {
		try {
			await client.userManagement().archiveUser(userId);
			await loadData();
			/* v8 ignore next 3 - error handling for archive failures */
		} catch (err) {
			setError(err instanceof Error ? err.message : content.errorArchivingUser.value);
		}
	}

	function handleEditUser(user: ActiveUser): void {
		setUserToEdit(user);
		setEditDialogOpen(true);
	}

	async function handleSaveUser(userId: number, name: string, role: OrgUserRole): Promise<void> {
		// Find the current user to check if name or role changed
		const currentUser = activeUsers.find(u => u.id === userId);
		/* v8 ignore start -- defensive: user always exists when dialog opens */
		if (!currentUser) {
			return;
		}
		/* v8 ignore stop */

		// Only call APIs for fields that changed
		/* v8 ignore next - null coalescing fallback when name is undefined */
		const nameChanged = name !== (currentUser.name ?? "");
		const roleChanged = role !== currentUser.role;

		if (nameChanged) {
			await client.userManagement().updateUserName(userId, name);
		}
		if (roleChanged) {
			await client.userManagement().updateUserRole(userId, role);
		}

		// Refresh the list
		await loadData();
	}

	// Calculate pagination values
	function getTotalForTab(): number {
		switch (activeTab) {
			case "active":
				return activeTotal;
			case "pending":
				return pendingTotal;
			case "archived":
				return archivedTotal;
		}
	}

	const total = getTotalForTab();
	const totalPages = Math.ceil(total / pageSize);
	const start = total > 0 ? (currentPage - 1) * pageSize + 1 : 0;
	const end = Math.min(currentPage * pageSize, total);

	function getRoleLabel(role: OrgUserRole): string {
		// Try to get label from loaded roles first
		const roleRecord = roles.find(r => r.slug === role);
		if (roleRecord) {
			return roleRecord.name;
		}
		// Fall back to localized labels for built-in roles
		switch (role) {
			case "owner":
				return content.roleOwner.value;
			case "admin":
				return content.roleAdmin.value;
			case "member":
				return content.roleMember.value;
		}
	}

	return (
		<div className="bg-card rounded-lg p-6 border h-full flex flex-col">
			{/* Tabs wrapper for Radix UI context */}
			<Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
				{/* Header with title on left, button on right */}
				<div className="mb-4 flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-semibold mb-2">{content.title}</h1>
						<p className="text-muted-foreground">{content.subtitle}</p>
					</div>
					{canManageUsers && (
						<Button onClick={() => setInviteDialogOpen(true)} data-testid="invite-user-button">
							<UserPlus className="h-4 w-4 mr-2" />
							{content.inviteButton}
						</Button>
					)}
				</div>

				{/* Tabs below title, left-aligned */}
				<TabsList className="mb-4 w-fit">
					<TabsTrigger value="active" data-testid="tab-active">
						{content.tabActive}
					</TabsTrigger>
					<TabsTrigger value="pending" data-testid="tab-pending">
						{content.tabPending}
					</TabsTrigger>
					<TabsTrigger value="archived" data-testid="tab-archived">
						{content.tabArchived}
					</TabsTrigger>
				</TabsList>

				{/* Error message */}
				{error && (
					<div className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 p-3">
						<p className="text-sm text-destructive">{error}</p>
					</div>
				)}

				{/* Active Users Tab */}
				<TabsContent value="active" className="flex-1 flex flex-col min-h-0">
					<UserTable
						type="active"
						data={activeUsers}
						loading={loading}
						emptyMessage={content.emptyActive.value}
						getRoleLabel={getRoleLabel}
						currentUserId={currentUserId}
						canEditUsers={canManageUsers}
						canManageUsers={canManageUsers}
						onEditUser={handleEditUser}
						onDeactivateUser={handleDeactivateUser}
						onActivateUser={handleActivateUser}
						onDeleteUser={handleDeleteUser}
					/>
				</TabsContent>

				{/* Pending Invitations Tab */}
				<TabsContent value="pending" className="flex-1 flex flex-col min-h-0">
					<UserTable
						type="pending"
						data={pendingInvitations}
						loading={loading}
						emptyMessage={content.emptyPending.value}
						getRoleLabel={getRoleLabel}
						canManageUsers={canManageUsers}
						onCancelInvitation={handleCancelInvitation}
						onResendInvitation={handleResendInvitation}
					/>
				</TabsContent>

				{/* Archived Users Tab */}
				<TabsContent value="archived" className="flex-1 flex flex-col min-h-0">
					<UserTable
						type="archived"
						data={archivedUsers}
						loading={loading}
						emptyMessage={content.emptyArchived.value}
						getRoleLabel={getRoleLabel}
					/>
				</TabsContent>
			</Tabs>

			{/* Pagination Footer - only show when there's more than one page */}
			{totalPages > 1 && (
				<div className="mt-4 flex items-center justify-between border-t pt-4">
					<div className="flex items-center gap-2">
						<span className="text-sm text-muted-foreground">{content.pageSize}</span>
						<NativeSelect
							value={pageSize}
							onChange={handlePageSizeChange}
							className="w-20"
							data-testid="page-size-select"
						>
							{PAGE_SIZE_OPTIONS.map(size => (
								<option key={size} value={size}>
									{size}
								</option>
							))}
						</NativeSelect>
					</div>

					<div className="text-sm text-muted-foreground">
						{content.showingResults.value
							.replace("{start}", String(start))
							.replace("{end}", String(end))
							.replace("{total}", String(total))}
					</div>

					<Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
				</div>
			)}

			{/* Invite User Dialog */}
			<InviteUserDialog
				open={inviteDialogOpen}
				onOpenChange={setInviteDialogOpen}
				onInvite={handleInviteUser}
				authorizedEmailPatterns={authorizedEmailPatterns}
				roles={roles}
			/>

			{/* Edit User Dialog */}
			<EditUserDialog
				open={editDialogOpen}
				onOpenChange={setEditDialogOpen}
				user={userToEdit}
				roles={roles}
				canEditRoles={canEditRoles}
				isSelf={Number(userToEdit?.id) === currentUserId}
				onSave={handleSaveUser}
			/>
		</div>
	);
}
