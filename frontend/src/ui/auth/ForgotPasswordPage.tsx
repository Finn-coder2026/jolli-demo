import { getLog } from "../../util/Logger";
import styles from "./LoginPage.module.css";
import { type ReactElement, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

export function ForgotPasswordPage(): ReactElement {
	const content = useIntlayer("forgotPasswordPage");
	const [email, setEmail] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isSuccess, setIsSuccess] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Email validation (matches LoginPage validation)
	function validateEmail(emailValue: string): boolean {
		/* v8 ignore start -- defensive validation, form has required attribute */
		if (!emailValue) {
			setError(content.emailRequired.value);
			return false;
		}
		/* v8 ignore stop */

		// RFC 5322 compliant email regex (simplified)
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		/* v8 ignore start -- defensive validation, browser validates email format */
		if (!emailRegex.test(emailValue)) {
			setError(content.invalidEmail.value);
			return false;
		}
		/* v8 ignore stop */

		return true;
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);

		// Validate email before submitting
		/* v8 ignore start -- defensive validation return, covered by validateEmail tests */
		if (!validateEmail(email)) {
			return;
		}
		/* v8 ignore stop */

		setIsLoading(true);

		try {
			// Use the correct better-auth API method
			// In better-auth 1.4+, the endpoint is /request-password-reset
			const response = await fetch(`${window.location.origin}/auth/request-password-reset`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email,
					redirectTo: `${window.location.origin}/reset-password`,
				}),
				credentials: "include",
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			setIsSuccess(true);
		} catch (err) {
			log.error("Password reset error: %o", err as object);
			setError(content.resetEmailFailed.value);
		} finally {
			setIsLoading(false);
		}
	}

	if (isSuccess) {
		return (
			<div className={styles.container}>
				<div className={styles.card}>
					<div className={styles.brandingContainer}>
						<div className={styles.iconBox}>✓</div>
						<div className={styles.textContainer}>
							<div className={styles.brandName}>{content.checkYourEmail}</div>
						</div>
					</div>

					<p style={{ textAlign: "center", color: "#5f6368", marginBottom: "24px" }}>
						{content.emailSentMessage} <strong>{email}</strong>. {content.checkInboxInstruction}
					</p>

					<p style={{ textAlign: "center", fontSize: "13px", color: "#80868b", marginBottom: "24px" }}>
						{content.linkExpiryMessage}
					</p>

					<a
						href="/login"
						style={{ textAlign: "center", display: "block", color: "#5b7ee5", textDecoration: "none" }}
					>
						{content.backToLogin}
					</a>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.container}>
			<div className={styles.card}>
				<div className={styles.brandingContainer}>
					<div className={styles.iconBox}>📄</div>
					<div className={styles.textContainer}>
						<div className={styles.brandName}>{content.forgotPassword}</div>
					</div>
				</div>

				<p style={{ textAlign: "center", color: "#5f6368", marginBottom: "24px", fontSize: "14px" }}>
					{content.enterEmailInstruction}
				</p>

				<form onSubmit={handleSubmit} className={styles.form}>
					<div>
						<input
							type="email"
							value={email}
							onChange={e => setEmail(e.target.value)}
							placeholder={content.emailPlaceholder.value}
							className={styles.input}
							required
							disabled={isLoading}
						/>
					</div>

					{error && <div className={styles.errorMessage}>{error}</div>}

					<button type="submit" className={styles.loginButton} disabled={isLoading}>
						{isLoading ? content.sendingButton : content.nextButton}
					</button>

					<a
						href="/login"
						style={{
							textAlign: "center",
							display: "block",
							fontSize: "14px",
							color: "#5b7ee5",
							textDecoration: "none",
							marginTop: "8px",
						}}
					>
						{content.backToLogin}
					</a>
				</form>
			</div>
		</div>
	);
}
