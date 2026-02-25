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
import { NativeSelect } from "../../components/ui/NativeSelect";
import type { OrgUserRole, Role } from "jolli-common";
import { type ReactElement, useCallback, useState } from "react";
import { useIntlayer } from "react-intlayer";

interface InviteUserDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onInvite: (email: string, role: OrgUserRole, name?: string) => Promise<void>;
	/** Authorized email patterns (comma-separated regex, or "*" for all) */
	authorizedEmailPatterns?: string | undefined;
	/** Available roles to choose from (loaded from API) */
	roles: Array<Role>;
}

/**
 * Checks if email should be validated on blur.
 * Returns true if the email has content after trimming.
 */
export function shouldValidateOnBlur(email: string): boolean {
	return email.trim().length > 0;
}

/**
 * Result of email validation.
 */
export interface EmailValidationResult {
	/** Whether the email is valid (or validation was skipped) */
	isValid: boolean;
	/** Error message if validation failed, undefined otherwise */
	error: string | undefined;
}

/**
 * Validates an email against authorized patterns.
 * This is a pure function for testability.
 * @param email - The email to validate
 * @param authorizedPatterns - Comma-separated regex patterns, "*" for all, or undefined
 * @param errorMessage - The error message to return if validation fails
 * @returns Validation result with isValid flag and optional error
 */
export function validateEmailPattern(
	email: string,
	authorizedPatterns: string | undefined,
	errorMessage: string,
): EmailValidationResult {
	// Skip validation for empty emails - no error to show
	if (!shouldValidateOnBlur(email)) {
		return { isValid: true, error: undefined };
	}

	// Skip pattern validation if patterns not loaded or allows all
	if (!authorizedPatterns || authorizedPatterns === "*" || authorizedPatterns === ".*") {
		return { isValid: true, error: undefined };
	}

	if (!isEmailPatternValid(email, authorizedPatterns)) {
		return { isValid: false, error: errorMessage };
	}

	return { isValid: true, error: undefined };
}

/**
 * Validates an email against the authorized email patterns.
 * @param email - The email to validate
 * @param patterns - Comma-separated regex patterns, or "*" for all emails
 * @returns true if the email matches at least one pattern
 */
export function isEmailPatternValid(email: string, patterns: string): boolean {
	// "*" or ".*" means all emails are allowed
	if (patterns === "*" || patterns === ".*") {
		return true;
	}

	// Parse comma-separated patterns and test email against each
	const patternList = patterns
		.split(",")
		.map(p => p.trim())
		.filter(p => p.length > 0);

	return patternList.some(pattern => {
		try {
			const regex = new RegExp(pattern);
			return regex.test(email);
		} catch {
			// Invalid regex pattern - skip it
			return false;
		}
	});
}

/**
 * Dialog for inviting a new user to the organization.
 */
export function InviteUserDialog({
	open,
	onOpenChange,
	onInvite,
	authorizedEmailPatterns,
	roles,
}: InviteUserDialogProps): ReactElement {
	const content = useIntlayer("users");

	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [role, setRole] = useState<OrgUserRole>("member");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [emailError, setEmailError] = useState<string | undefined>();

	function resetForm(): void {
		setEmail("");
		setName("");
		setRole("member");
		setError(undefined);
		setEmailError(undefined);
	}

	function handleOpenChange(open: boolean): void {
		if (!open) {
			resetForm();
		}
		onOpenChange(open);
	}

	// Validate email against authorized patterns - uses pure function for testability
	const validateEmail = useCallback(
		(emailValue: string): boolean => {
			const result = validateEmailPattern(emailValue, authorizedEmailPatterns, content.emailPatternError.value);
			setEmailError(result.error);
			return result.isValid;
		},
		[authorizedEmailPatterns, content.emailPatternError.value],
	);

	// Blur handler - validates trimmed email
	const handleEmailBlur = useCallback((): void => {
		validateEmail(email.trim());
	}, [email, validateEmail]);

	function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>): void {
		const newEmail = e.target.value;
		setEmail(newEmail);
		// Clear email error on change, will revalidate on blur or submit
		if (emailError) {
			setEmailError(undefined);
		}
	}

	async function handleSubmit(event: React.FormEvent): Promise<void> {
		event.preventDefault();

		const trimmedEmail = email.trim();
		if (!trimmedEmail) {
			return;
		}

		// Validate email pattern before submitting
		if (!validateEmail(trimmedEmail)) {
			return;
		}

		setLoading(true);
		setError(undefined);

		try {
			await onInvite(trimmedEmail, role, name.trim() || undefined);
			resetForm();
		} catch (err) {
			setError(err instanceof Error ? err.message : content.errorInvitingUser.value);
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent data-testid="invite-user-dialog">
				<DialogHeader>
					<DialogTitle>{content.inviteDialogTitle}</DialogTitle>
					<DialogDescription>{content.inviteDialogDescription}</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit}>
					<div className="space-y-4 py-4">
						{error && (
							<div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
								<p className="text-sm text-destructive">{error}</p>
							</div>
						)}

						<div className="space-y-2">
							<Label htmlFor="invite-email">{content.inviteEmailLabel}</Label>
							<Input
								id="invite-email"
								type="email"
								placeholder={content.inviteEmailPlaceholder.value}
								value={email}
								onChange={handleEmailChange}
								onBlur={handleEmailBlur}
								required
								disabled={loading}
								data-testid="invite-email-input"
								className={emailError ? "border-destructive" : undefined}
							/>
							{emailError && <p className="text-sm text-destructive">{emailError}</p>}
						</div>

						<div className="space-y-2">
							<Label htmlFor="invite-name">{content.inviteNameLabel}</Label>
							<Input
								id="invite-name"
								type="text"
								placeholder={content.inviteNamePlaceholder.value}
								value={name}
								onChange={e => setName(e.target.value)}
								disabled={loading}
								data-testid="invite-name-input"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="invite-role">{content.inviteRoleLabel}</Label>
							<NativeSelect
								id="invite-role"
								value={role}
								onChange={e => setRole(e.target.value as OrgUserRole)}
								disabled={loading}
								data-testid="invite-role-select"
							>
								{roles.length > 0
									? // Use roles from API, excluding owner (can't invite as owner)
										roles
											.filter(r => r.slug !== "owner")
											.map(r => (
												<option key={r.id} value={r.slug}>
													{r.name}
												</option>
											))
									: // Fallback to hardcoded options if roles not loaded
										[
											<option key="member" value="member">
												{content.roleMember}
											</option>,
											<option key="admin" value="admin">
												{content.roleAdmin}
											</option>,
										]}
							</NativeSelect>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={loading}
						>
							{content.inviteCancelButton}
						</Button>
						<Button
							type="submit"
							disabled={loading || !email.trim() || !!emailError}
							data-testid="invite-submit-button"
						>
							{content.inviteSendButton}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
