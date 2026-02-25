/**
 * ProfilePage - User profile management page.
 *
 * Allows users to:
 * - View and edit their name
 * - View their email (read-only)
 * - Set password (for OAuth-only users)
 * - Change password (for users with password authentication)
 */

import { Button } from "../../components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { useClient } from "../../contexts/ClientContext";
import { useNavigate } from "../../contexts/RouterContext";
import { authClient } from "../../lib/authClient";
import { clearRememberMePreference } from "../../util/AuthCookieUtil";
import type { ProfileData } from "jolli-common";
import { Key, Pencil, RotateCcw } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";
import { toast } from "sonner";

/** Password validation regex: 8-36 chars, at least one lowercase, uppercase, digit, and special char. */
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,36}$/;

/**
 * Gets initials from user name or email.
 */
function getUserInitials(name: string | undefined, email: string): string {
	if (name) {
		const names = name.split(" ");
		if (names.length >= 2) {
			return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
		}
		return name.substring(0, 2).toUpperCase();
	}
	return email.substring(0, 2).toUpperCase();
}

export function ProfilePage(): ReactElement {
	const content = useIntlayer("profile-page");
	const client = useClient();
	const navigate = useNavigate();

	// Profile state
	const [profile, setProfile] = useState<ProfileData | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [hasPassword, setHasPassword] = useState<boolean | null>(null);

	// Name editing state
	const [isEditingName, setIsEditingName] = useState(false);
	const [editedName, setEditedName] = useState("");
	const [isSavingName, setIsSavingName] = useState(false);

	// Password change dialog state
	const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isChangingPassword, setIsChangingPassword] = useState(false);
	const [passwordError, setPasswordError] = useState<string | null>(null);

	// Set password dialog state (for OAuth-only users)
	const [isSetPasswordDialogOpen, setIsSetPasswordDialogOpen] = useState(false);
	const [isSettingPassword, setIsSettingPassword] = useState(false);

	// Auth gateway origin for multi-tenant redirect
	const [authGatewayOrigin, setAuthGatewayOrigin] = useState<string | undefined>(undefined);

	// Onboarding restart state
	const [isRestartingOnboarding, setIsRestartingOnboarding] = useState(false);

	// Load profile on mount
	useEffect(() => {
		loadProfile();
	}, []);

	async function loadProfile(): Promise<void> {
		setIsLoading(true);
		try {
			const [data, passwordStatus, sessionConfig] = await Promise.all([
				client.profile().getProfile(),
				client.profile().hasPassword(),
				client.auth().getSessionConfig(),
			]);
			setProfile(data);
			setHasPassword(passwordStatus.hasPassword);
			if (sessionConfig.authGatewayOrigin) {
				setAuthGatewayOrigin(sessionConfig.authGatewayOrigin);
			}
		} catch (_error) {
			toast.error(content.loadError.value);
		} finally {
			setIsLoading(false);
		}
	}

	/**
	 * Get the login URL based on authGatewayOrigin for multi-tenant redirect.
	 */
	function getLoginUrl(): string {
		return authGatewayOrigin ? `${authGatewayOrigin}/login` : "/login";
	}

	const resetPasswordForm = useCallback(() => {
		setCurrentPassword("");
		setNewPassword("");
		setConfirmPassword("");
		setPasswordError(null);
	}, []);

	function handleStartEditName(): void {
		setEditedName(profile?.name ?? "");
		setIsEditingName(true);
	}

	function handleCancelEditName(): void {
		setIsEditingName(false);
		setEditedName("");
	}

	async function handleSaveName(): Promise<void> {
		const trimmedName = editedName.trim();
		if (!trimmedName || trimmedName === profile?.name) {
			handleCancelEditName();
			return;
		}

		setIsSavingName(true);
		try {
			const updatedProfile = await client.profile().updateProfile({ name: trimmedName });
			setProfile(updatedProfile);
			setIsEditingName(false);
			setEditedName("");
			toast.success(content.nameUpdateSuccess.value);
		} catch (_error) {
			toast.error(content.nameUpdateError.value);
		} finally {
			setIsSavingName(false);
		}
	}

	function handlePasswordDialogOpen(open: boolean): void {
		setIsPasswordDialogOpen(open);
		if (!open) {
			resetPasswordForm();
		}
	}

	async function handleChangePassword(): Promise<void> {
		/* v8 ignore start -- defensive check: button only renders when hasPassword=true */
		// Protection check: verify user has password before attempting to change it
		if (!hasPassword) {
			setPasswordError(content.noPasswordToChange.value);
			return;
		}
		/* v8 ignore stop */

		// Validate passwords match
		if (newPassword !== confirmPassword) {
			setPasswordError(content.passwordMismatch.value);
			return;
		}

		// Basic password validation (backend also validates)
		if (!PASSWORD_REGEX.test(newPassword)) {
			setPasswordError(content.passwordRequirements.value);
			return;
		}

		setPasswordError(null);
		setIsChangingPassword(true);

		try {
			await client.profile().changePassword({
				currentPassword,
				newPassword,
			});
			// Logout all sessions for security after password change
			await client.profile().logoutAllSessions();
			// Clear remember-me preference cookie (shared across subdomains)
			clearRememberMePreference();
			toast.success(content.passwordChangeSuccess.value);
			handlePasswordDialogOpen(false);
			// Call better-auth signOut to clean up its session state
			// Note: logoutAllSessions already cleared cookies and revoked tokens
			try {
				await authClient.signOut();
			} catch {
				// Session may already be invalid
			}
			window.location.href = getLoginUrl();
		} catch (error) {
			const message = error instanceof Error ? error.message : content.passwordChangeError.value;
			setPasswordError(message);
			setIsChangingPassword(false);
		}
	}

	function handleSetPasswordDialogOpen(open: boolean): void {
		setIsSetPasswordDialogOpen(open);
		if (!open) {
			setNewPassword("");
			setConfirmPassword("");
			setPasswordError(null);
		}
	}

	async function handleSetPassword(): Promise<void> {
		/* v8 ignore start -- defensive check: button only renders when hasPassword=false */
		// Protection check: verify user doesn't already have password before setting one
		if (hasPassword) {
			setPasswordError(content.passwordAlreadySet.value);
			return;
		}
		/* v8 ignore stop */

		// Validate passwords match
		if (newPassword !== confirmPassword) {
			setPasswordError(content.passwordMismatch.value);
			return;
		}

		// Basic password validation (backend also validates)
		if (!PASSWORD_REGEX.test(newPassword)) {
			setPasswordError(content.passwordRequirements.value);
			return;
		}

		setPasswordError(null);
		setIsSettingPassword(true);

		try {
			await client.profile().setPassword({ newPassword });
			toast.success(content.setPasswordSuccess.value);
			setHasPassword(true);
			handleSetPasswordDialogOpen(false);
		} catch (error) {
			const message = error instanceof Error ? error.message : content.setPasswordError.value;
			setPasswordError(message);
		} finally {
			setIsSettingPassword(false);
		}
	}

	async function handleRestartOnboarding(): Promise<void> {
		setIsRestartingOnboarding(true);
		try {
			await client.onboarding().restart();
			toast.success(content.restartOnboardingSuccess.value);
			navigate("/articles");
			window.dispatchEvent(new CustomEvent("jolli:onboarding-restart"));
		} catch (_error) {
			toast.error(content.restartOnboardingError.value);
		} finally {
			setIsRestartingOnboarding(false);
		}
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64" data-testid="profile-loading">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
			</div>
		);
	}

	if (!profile) {
		return (
			<div className="text-center text-muted-foreground py-8" data-testid="profile-error">
				{content.loadError.value}
			</div>
		);
	}

	const initials = getUserInitials(profile.name, profile.email);

	return (
		<div className="space-y-8" data-testid="profile-page">
			{/* Header */}
			<div>
				<h1 className="text-2xl font-semibold mb-2" data-testid="profile-title">
					{content.title.value}
				</h1>
				<p className="text-muted-foreground">{content.subtitle.value}</p>
			</div>

			{/* Profile Picture Section */}
			<div className="space-y-3" data-testid="profile-picture-section">
				<p className="text-base font-medium">{content.profilePictureLabel.value}</p>
				<div
					className="h-20 w-20 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-2xl font-semibold"
					data-testid="profile-avatar"
				>
					{profile.image ? (
						<img
							src={profile.image}
							alt={profile.name}
							className="h-full w-full rounded-full object-cover"
							data-testid="profile-image"
						/>
					) : (
						initials
					)}
				</div>
			</div>

			{/* Name Field */}
			<div className="space-y-1" data-testid="profile-name-field">
				<p className="text-sm text-muted-foreground">{content.nameLabel.value}</p>
				{isEditingName ? (
					<div className="flex items-center gap-2">
						<Input
							value={editedName}
							onChange={e => setEditedName(e.target.value)}
							disabled={isSavingName}
							className="max-w-xs"
							data-testid="profile-name-input"
							autoFocus
						/>
						<Button
							size="sm"
							onClick={handleSaveName}
							disabled={isSavingName || !editedName.trim()}
							data-testid="profile-name-save-button"
						>
							{content.saveNameButton.value}
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={handleCancelEditName}
							disabled={isSavingName}
							data-testid="profile-name-cancel-button"
						>
							{content.cancelButton.value}
						</Button>
					</div>
				) : (
					<div className="flex items-center gap-2">
						<p className="text-base" data-testid="profile-name-display">
							{profile.name}
						</p>
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6 text-muted-foreground hover:text-foreground"
							onClick={handleStartEditName}
							data-testid="profile-name-change-link"
						>
							<Pencil className="h-4 w-4" />
						</Button>
					</div>
				)}
			</div>

			{/* Email Field */}
			<div className="space-y-1" data-testid="profile-email-field">
				<p className="text-sm text-muted-foreground">{content.emailLabel.value}</p>
				<p className="text-base" data-testid="profile-email-display">
					{profile.email}
				</p>
			</div>

			{/* Password Section */}
			<div className="space-y-2" data-testid="profile-password-section">
				<p className="text-base font-medium">{content.passwordLabel.value}</p>
				<p className="text-sm text-muted-foreground">
					{hasPassword ? content.passwordDescription.value : content.passwordDescriptionNoPassword.value}
				</p>
				{hasPassword ? (
					<Button
						variant="outline"
						size="sm"
						onClick={() => handlePasswordDialogOpen(true)}
						className="flex items-center gap-2"
						data-testid="change-password-button"
					>
						<Key className="h-4 w-4" />
						{content.changePasswordButton.value}
					</Button>
				) : (
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleSetPasswordDialogOpen(true)}
						className="flex items-center gap-2"
						data-testid="set-password-button"
					>
						<Key className="h-4 w-4" />
						{content.setPasswordButton.value}
					</Button>
				)}
			</div>

			{/* Onboarding Section */}
			<div className="space-y-2" data-testid="profile-onboarding-section">
				<p className="text-base font-medium">{content.onboardingLabel.value}</p>
				<p className="text-sm text-muted-foreground">{content.onboardingDescription.value}</p>
				<Button
					variant="outline"
					size="sm"
					onClick={handleRestartOnboarding}
					disabled={isRestartingOnboarding}
					className="flex items-center gap-2"
					data-testid="restart-onboarding-button"
				>
					<RotateCcw className="h-4 w-4" />
					{content.restartOnboardingButton.value}
				</Button>
			</div>

			{/* Change Password Dialog */}
			<Dialog open={isPasswordDialogOpen} onOpenChange={handlePasswordDialogOpen}>
				<DialogContent data-testid="change-password-dialog">
					<DialogHeader>
						<DialogTitle>{content.changePasswordDialogTitle.value}</DialogTitle>
						<DialogDescription>{content.changePasswordDialogDescription.value}</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						{passwordError && (
							<div
								className="text-sm text-destructive bg-destructive/10 p-3 rounded-md"
								data-testid="password-error"
							>
								{passwordError}
							</div>
						)}

						<div className="space-y-2">
							<Label htmlFor="currentPassword">{content.currentPasswordLabel.value}</Label>
							<Input
								id="currentPassword"
								type="password"
								value={currentPassword}
								onChange={e => setCurrentPassword(e.currentTarget.value)}
								data-testid="current-password-input"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="newPassword">{content.newPasswordLabel.value}</Label>
							<Input
								id="newPassword"
								type="password"
								value={newPassword}
								onChange={e => setNewPassword(e.currentTarget.value)}
								data-testid="new-password-input"
							/>
							<p className="text-xs text-muted-foreground">{content.passwordRequirements.value}</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="confirmPassword">{content.confirmPasswordLabel.value}</Label>
							<Input
								id="confirmPassword"
								type="password"
								value={confirmPassword}
								onChange={e => setConfirmPassword(e.currentTarget.value)}
								data-testid="confirm-password-input"
							/>
						</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => handlePasswordDialogOpen(false)}>
							{content.cancelButton.value}
						</Button>
						<Button
							onClick={handleChangePassword}
							disabled={!currentPassword || !newPassword || !confirmPassword || isChangingPassword}
							data-testid="update-password-button"
						>
							{isChangingPassword
								? content.updatingPasswordButton.value
								: content.updatePasswordButton.value}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Set Password Dialog (for OAuth-only users) */}
			<Dialog open={isSetPasswordDialogOpen} onOpenChange={handleSetPasswordDialogOpen}>
				<DialogContent data-testid="set-password-dialog">
					<DialogHeader>
						<DialogTitle>{content.setPasswordDialogTitle.value}</DialogTitle>
						<DialogDescription>{content.setPasswordDialogDescription.value}</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						{passwordError && (
							<div
								className="text-sm text-destructive bg-destructive/10 p-3 rounded-md"
								data-testid="set-password-error"
							>
								{passwordError}
							</div>
						)}

						<div className="space-y-2">
							<Label htmlFor="setNewPassword">{content.newPasswordLabel.value}</Label>
							<Input
								id="setNewPassword"
								type="password"
								value={newPassword}
								onChange={e => setNewPassword(e.currentTarget.value)}
								data-testid="set-new-password-input"
							/>
							<p className="text-xs text-muted-foreground">{content.passwordRequirements.value}</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="setConfirmPassword">{content.confirmPasswordLabel.value}</Label>
							<Input
								id="setConfirmPassword"
								type="password"
								value={confirmPassword}
								onChange={e => setConfirmPassword(e.currentTarget.value)}
								data-testid="set-confirm-password-input"
							/>
						</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => handleSetPasswordDialogOpen(false)}>
							{content.cancelButton.value}
						</Button>
						<Button
							onClick={handleSetPassword}
							disabled={!newPassword || !confirmPassword || isSettingPassword}
							data-testid="set-password-submit-button"
						>
							{isSettingPassword
								? content.settingPasswordButton.value
								: content.setPasswordButtonLabel.value}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
