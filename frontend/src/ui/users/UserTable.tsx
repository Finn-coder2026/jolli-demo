import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../../components/ui/AlertDialog";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu";
import type { ActiveUser, ArchivedUser, OrgUserRole, UserInvitation } from "jolli-common";
import { MoreHorizontal } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useIntlayer } from "react-intlayer";

interface BaseTableProps {
	loading: boolean;
	emptyMessage: string;
	getRoleLabel: (role: OrgUserRole) => string;
}

interface ActiveTableProps extends BaseTableProps {
	type: "active";
	data: Array<ActiveUser>;
	/** The current logged-in user's ID, used to prevent self-actions */
	currentUserId: number;
	/** Whether the current user has permission to edit users (name/role) */
	canEditUsers: boolean;
	/** Whether the current user has permission to manage users (deactivate/activate/delete) */
	canManageUsers: boolean;
	onEditUser: (user: ActiveUser) => void;
	onDeactivateUser: (userId: number) => Promise<void>;
	onActivateUser: (userId: number) => Promise<void>;
	onDeleteUser: (userId: number) => Promise<void>;
	onCancelInvitation?: never;
	onResendInvitation?: never;
}

interface PendingTableProps extends BaseTableProps {
	type: "pending";
	data: Array<UserInvitation>;
	/** Whether the current user has permission to manage invitations (resend/cancel) */
	canManageUsers: boolean;
	onCancelInvitation: (id: number) => Promise<void>;
	onResendInvitation: (id: number) => Promise<void>;
	onUpdateRole?: never;
	onDeactivateUser?: never;
	onActivateUser?: never;
	onDeleteUser?: never;
}

interface ArchivedTableProps extends BaseTableProps {
	type: "archived";
	data: Array<ArchivedUser>;
	onUpdateRole?: never;
	onDeactivateUser?: never;
	onActivateUser?: never;
	onDeleteUser?: never;
	onCancelInvitation?: never;
	onResendInvitation?: never;
}

type UserTableProps = ActiveTableProps | PendingTableProps | ArchivedTableProps;

/**
 * Reusable table component for displaying users, invitations, or archived users.
 */
export function UserTable(props: UserTableProps): ReactElement {
	const content = useIntlayer("users");
	const { type, data, loading, emptyMessage, getRoleLabel } = props;

	if (loading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<p className="text-muted-foreground">{content.loading}</p>
			</div>
		);
	}

	if (data.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<p className="text-muted-foreground">{emptyMessage}</p>
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-auto scrollbar-thin">
			<table className="w-full" data-testid={`user-table-${type}`}>
				<thead className="sticky top-0 bg-card">
					<tr className="border-b">
						{type === "active" && (
							<>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">
									{content.columnUser}
								</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">
									{content.columnRole}
								</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">
									{content.columnStatus}
								</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">
									{content.columnJoined}
								</th>
								{(props.canEditUsers || props.canManageUsers) && (
									<th className="text-right py-3 px-4 font-medium text-muted-foreground">
										{content.columnActions}
									</th>
								)}
							</>
						)}
						{type === "pending" && (
							<>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">
									{content.columnEmail}
								</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">
									{content.columnName}
								</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">
									{content.columnRole}
								</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">
									{content.columnExpiresAt}
								</th>
								{props.canManageUsers && (
									<th className="text-right py-3 px-4 font-medium text-muted-foreground">
										{content.columnActions}
									</th>
								)}
							</>
						)}
						{type === "archived" && (
							<>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">
									{content.columnName}
								</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">
									{content.columnEmail}
								</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">
									{content.columnRole}
								</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">
									{content.columnRemovedBy}
								</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">
									{content.columnRemovedAt}
								</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">
									{content.columnReason}
								</th>
							</>
						)}
					</tr>
				</thead>
				<tbody>
					{type === "active" &&
						(data as Array<ActiveUser>).map(user => (
							<ActiveUserRow
								key={user.id}
								user={user}
								isSelf={Number(user.id) === props.currentUserId}
								canEditUsers={props.canEditUsers}
								canManageUsers={props.canManageUsers}
								getRoleLabel={getRoleLabel}
								onEditUser={props.onEditUser}
								onDeactivateUser={props.onDeactivateUser}
								onActivateUser={props.onActivateUser}
								onDeleteUser={props.onDeleteUser}
							/>
						))}
					{type === "pending" &&
						(data as Array<UserInvitation>).map(invitation => (
							<PendingInvitationRow
								key={invitation.id}
								invitation={invitation}
								getRoleLabel={getRoleLabel}
								canManageUsers={props.canManageUsers}
								onCancel={props.onCancelInvitation}
								onResend={props.onResendInvitation}
							/>
						))}
					{type === "archived" &&
						(data as Array<ArchivedUser>).map(user => (
							<ArchivedUserRow key={user.id} user={user} getRoleLabel={getRoleLabel} />
						))}
				</tbody>
			</table>
		</div>
	);
}

interface ActiveUserRowProps {
	user: ActiveUser;
	/** Whether this row represents the current logged-in user */
	isSelf: boolean;
	/** Whether the current user has permission to edit users (name/role) */
	canEditUsers: boolean;
	/** Whether the current user has permission to manage users (deactivate/activate/delete) */
	canManageUsers: boolean;
	getRoleLabel: (role: OrgUserRole) => string;
	onEditUser: (user: ActiveUser) => void;
	onDeactivateUser: (userId: number) => Promise<void>;
	onActivateUser: (userId: number) => Promise<void>;
	onDeleteUser: (userId: number) => Promise<void>;
}

type UserAction = "activate" | "deactivate" | "delete" | null;

function ActiveUserRow({
	user,
	isSelf,
	canEditUsers,
	canManageUsers,
	getRoleLabel,
	onEditUser,
	onDeactivateUser,
	onActivateUser,
	onDeleteUser,
}: ActiveUserRowProps): ReactElement {
	const content = useIntlayer("users");
	const [pendingAction, setPendingAction] = useState<UserAction>(null);

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString();
	}

	async function handleConfirmAction(): Promise<void> {
		switch (pendingAction) {
			case "activate":
				await onActivateUser(user.id);
				break;
			case "deactivate":
				await onDeactivateUser(user.id);
				break;
			case "delete":
				await onDeleteUser(user.id);
				break;
		}
		setPendingAction(null);
	}

	/* c8 ignore start: Radix AlertDialog dismissal via overlay/Escape is difficult to test in Vitest */
	function handleDialogOpenChange(open: boolean): void {
		if (!open) {
			setPendingAction(null);
		}
	}
	/* c8 ignore stop */

	// Owner and self cannot be deactivated, deleted, or have their role changed
	const isOwner = user.role === "owner";
	const isProtected = isOwner || isSelf;
	// Show actions column if user can edit or manage users
	const showActions = canEditUsers || canManageUsers;

	return (
		<>
			<tr className="border-b hover:bg-muted/50" data-testid={`user-row-${user.id}`}>
				<td className="py-3 px-4">
					<div className="flex items-center gap-3">
						{user.image && <img src={user.image} alt="" className="w-8 h-8 rounded-full" />}
						<div className="flex flex-col">
							<span className="font-medium">{user.name || "-"}</span>
							<span className="text-sm text-muted-foreground">{user.email}</span>
						</div>
					</div>
				</td>
				<td className="py-3 px-4" data-testid={`role-${user.role}`}>
					{getRoleLabel(user.role)}
				</td>
				<td className="py-3 px-4">
					{user.isActive ? (
						<Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
							{content.statusActive}
						</Badge>
					) : (
						<Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
							{content.statusInactive}
						</Badge>
					)}
				</td>
				<td className="py-3 px-4">{formatDate(user.createdAt)}</td>
				{showActions && (
					<td className="py-3 px-4 text-right">
						{isProtected ? (
							<span className="text-muted-foreground text-sm">-</span>
						) : (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="sm"
										className="h-8 w-8 p-0"
										data-testid={`actions-${user.id}`}
									>
										<MoreHorizontal className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{canEditUsers && (
										<DropdownMenuItem
											onClick={() => onEditUser(user)}
											data-testid={`edit-user-${user.id}`}
										>
											{content.actionEdit}
										</DropdownMenuItem>
									)}
									{canEditUsers && canManageUsers && <DropdownMenuSeparator />}
									{canManageUsers && (
										<>
											{user.isActive ? (
												<DropdownMenuItem
													onClick={() => setPendingAction("deactivate")}
													className="text-destructive focus:text-destructive"
													data-testid={`deactivate-user-${user.id}`}
												>
													{content.actionDeactivate}
												</DropdownMenuItem>
											) : (
												<DropdownMenuItem
													onClick={() => setPendingAction("activate")}
													data-testid={`activate-user-${user.id}`}
												>
													{content.actionActivate}
												</DropdownMenuItem>
											)}
											<DropdownMenuItem
												onClick={() => setPendingAction("delete")}
												className="text-destructive focus:text-destructive"
												data-testid={`delete-user-${user.id}`}
											>
												{content.actionDelete}
											</DropdownMenuItem>
										</>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</td>
				)}
			</tr>

			{/* User Action Confirmation Dialog */}
			<AlertDialog open={pendingAction !== null} onOpenChange={handleDialogOpenChange}>
				<AlertDialogContent data-testid={`action-dialog-${user.id}`}>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{pendingAction === "delete" && content.confirmDeleteUserTitle}
							{pendingAction === "deactivate" && content.confirmDeactivateUserTitle}
							{pendingAction === "activate" && content.confirmActivateUserTitle}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{/* v8 ignore next 2 - JSX conditional, branch tested via action-specific tests */}
							{pendingAction === "delete" &&
								content.confirmDeleteUserDescription({ name: user.name || user.email })}
							{/* v8 ignore next 2 - JSX conditional, branch tested via action-specific tests */}
							{pendingAction === "deactivate" &&
								content.confirmDeactivateUserDescription({ name: user.name || user.email })}
							{/* v8 ignore next 2 - JSX conditional, branch tested via action-specific tests */}
							{pendingAction === "activate" &&
								content.confirmActivateUserDescription({ name: user.name || user.email })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel data-testid="action-cancel-button">
							{content.inviteCancelButton}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleConfirmAction}
							className={
								pendingAction === "activate"
									? ""
									: "bg-destructive text-destructive-foreground hover:bg-destructive/90"
							}
							data-testid="action-confirm-button"
						>
							{pendingAction === "delete" && content.confirmDeleteUserButton}
							{pendingAction === "deactivate" && content.confirmDeactivateUserButton}
							{pendingAction === "activate" && content.confirmActivateUserButton}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

interface PendingInvitationRowProps {
	invitation: UserInvitation;
	getRoleLabel: (role: OrgUserRole) => string;
	/** Whether the current user has permission to manage invitations */
	canManageUsers: boolean;
	onCancel: (id: number) => Promise<void>;
	onResend: (id: number) => Promise<void>;
}

function PendingInvitationRow({
	invitation,
	getRoleLabel,
	canManageUsers,
	onCancel,
	onResend,
}: PendingInvitationRowProps): ReactElement {
	const content = useIntlayer("users");
	const [showResendDialog, setShowResendDialog] = useState(false);
	const [showCancelDialog, setShowCancelDialog] = useState(false);

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString();
	}

	async function handleConfirmResend(): Promise<void> {
		await onResend(invitation.id);
		setShowResendDialog(false);
	}

	async function handleConfirmCancel(): Promise<void> {
		await onCancel(invitation.id);
		setShowCancelDialog(false);
	}

	const isExpired = new Date(invitation.expiresAt) < new Date();

	return (
		<>
			<tr className="border-b hover:bg-muted/50" data-testid={`invitation-row-${invitation.id}`}>
				<td className="py-3 px-4">{invitation.email}</td>
				<td className="py-3 px-4">{invitation.name || "-"}</td>
				<td className="py-3 px-4" data-testid={`role-${invitation.role}`}>
					{getRoleLabel(invitation.role)}
				</td>
				<td className="py-3 px-4">
					<span className={isExpired ? "text-destructive" : ""}>
						{formatDate(invitation.expiresAt)}
						{isExpired && ` (${content.statusExpired.value})`}
					</span>
				</td>
				{canManageUsers && (
					<td className="py-3 px-4 text-right">
						<div className="flex items-center justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setShowResendDialog(true)}
								data-testid={`resend-invitation-${invitation.id}`}
							>
								{content.actionResend}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setShowCancelDialog(true)}
								data-testid={`cancel-invitation-${invitation.id}`}
							>
								{content.actionCancel}
							</Button>
						</div>
					</td>
				)}
			</tr>

			{/* Resend Confirmation Dialog */}
			<AlertDialog open={showResendDialog} onOpenChange={setShowResendDialog}>
				<AlertDialogContent data-testid={`resend-dialog-${invitation.id}`}>
					<AlertDialogHeader>
						<AlertDialogTitle>{content.confirmResendInvitationTitle}</AlertDialogTitle>
						<AlertDialogDescription>
							{content.confirmResendInvitationDescription({ email: invitation.email })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel data-testid="resend-cancel-button">
							{content.inviteCancelButton}
						</AlertDialogCancel>
						<AlertDialogAction onClick={handleConfirmResend} data-testid="resend-confirm-button">
							{content.confirmResendButton}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Cancel Confirmation Dialog */}
			<AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
				<AlertDialogContent data-testid={`cancel-dialog-${invitation.id}`}>
					<AlertDialogHeader>
						<AlertDialogTitle>{content.confirmCancelInvitationTitle}</AlertDialogTitle>
						<AlertDialogDescription>
							{content.confirmCancelInvitationDescription({ email: invitation.email })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel data-testid="cancel-dialog-dismiss-button">
							{content.inviteCancelButton}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleConfirmCancel}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							data-testid="cancel-dialog-confirm-button"
						>
							{content.confirmCancelInvitationButton}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

interface ArchivedUserRowProps {
	user: ArchivedUser;
	getRoleLabel: (role: OrgUserRole) => string;
}

function ArchivedUserRow({ user, getRoleLabel }: ArchivedUserRowProps): ReactElement {
	/**
	 * Format a date string to show detailed date and time.
	 */
	function formatDateTime(dateString: string): string {
		return new Date(dateString).toLocaleString();
	}

	return (
		<tr className="border-b hover:bg-muted/50" data-testid={`archived-row-${user.id}`}>
			<td className="py-3 px-4">{user.name || "-"}</td>
			<td className="py-3 px-4">{user.email}</td>
			<td className="py-3 px-4" data-testid={user.role ? `role-${user.role}` : undefined}>
				{user.role ? getRoleLabel(user.role) : "-"}
			</td>
			<td className="py-3 px-4">{user.removedByName || "-"}</td>
			<td className="py-3 px-4">{formatDateTime(user.removedAt)}</td>
			<td className="py-3 px-4">{user.reason || "-"}</td>
		</tr>
	);
}
