import { getConfig } from "../config/Config";
import type { EmailLocale } from "./EmailContent";
import {
	getOAuthNotificationEmailContent,
	getPasswordResetEmailContent,
	getSecurityAlertEmailContent,
} from "./EmailContent";
import { getLog } from "./Logger";
import sgMail from "@sendgrid/mail";

const log = getLog(import.meta);

// Re-export EmailLocale for convenience
export type { EmailLocale };

export interface SendPasswordResetEmailParams {
	toEmail: string;
	toName: string | null;
	resetUrl: string;
	locale?: EmailLocale; // Optional, defaults to 'en'
}

/**
 * Send a password reset email via SendGrid
 */
export async function sendPasswordResetEmail(params: SendPasswordResetEmailParams): Promise<void> {
	const config = getConfig();

	if (!config.SENDGRID_API_KEY || !config.SENDGRID_FROM_EMAIL) {
		log.warn("SendGrid not configured, skipping password reset email");
		return;
	}

	sgMail.setApiKey(config.SENDGRID_API_KEY);

	const locale = params.locale || "en";
	const content = getPasswordResetEmailContent(locale);

	const htmlContent = generatePasswordResetEmailHtml({
		userName: params.toName || content.defaultUserName,
		resetUrl: params.resetUrl,
		locale,
	});

	try {
		await sgMail.send({
			to: params.toEmail,
			from: {
				email: config.SENDGRID_FROM_EMAIL,
				name: config.SENDGRID_FROM_NAME,
			},
			subject: content.subject,
			html: htmlContent,
		});
		log.info({ email: params.toEmail, locale }, "Password reset email sent successfully");
	} catch (error) {
		log.error({ error, email: params.toEmail }, "Failed to send password reset email");
		throw error;
	}
}

/**
 * Generate the HTML content for password reset email
 */
function generatePasswordResetEmailHtml(data: { userName: string; resetUrl: string; locale: EmailLocale }): string {
	const content = getPasswordResetEmailContent(data.locale);
	return `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${content.title}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
	<div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
		<h1 style="color: #007bff; margin-top: 0;">${content.title}</h1>
		<p>${content.greeting(data.userName)}</p>
		<p>${content.intro}</p>

		<div style="text-align: center; margin: 30px 0;">
			<a href="${data.resetUrl}"
			   style="background-color: #007bff;
			          color: white;
			          padding: 12px 30px;
			          text-decoration: none;
			          border-radius: 5px;
			          display: inline-block;
			          font-weight: bold;">
				${content.buttonText}
			</a>
		</div>

		<p>${content.expiryNotice}</p>

		<p>${content.manualLinkInstructions}</p>
		<p style="word-break: break-all; color: #007bff;">${data.resetUrl}</p>

		<hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

		<p style="color: #666; font-size: 14px;">
			${content.securityNotice}
		</p>

		<p style="color: #666; font-size: 14px;">
			${content.closing}
		</p>
	</div>
</body>
</html>
	`.trim();
}

/**
 * Send a social login notification email when a user tries to reset password
 * but their account only uses OAuth authentication
 */
export async function sendOAuthAccountNotificationEmail(toEmail: string, locale: EmailLocale = "en"): Promise<void> {
	const config = getConfig();

	if (!config.SENDGRID_API_KEY || !config.SENDGRID_FROM_EMAIL) {
		log.warn("SendGrid not configured, skipping OAuth notification email");
		return;
	}

	sgMail.setApiKey(config.SENDGRID_API_KEY);

	const content = getOAuthNotificationEmailContent(locale);

	const htmlContent = generateOAuthNotificationEmailHtml({
		loginUrl: `${config.AUTH_GATEWAY_ORIGIN || config.ORIGIN}/login`,
		locale,
	});

	try {
		await sgMail.send({
			to: toEmail,
			from: {
				email: config.SENDGRID_FROM_EMAIL,
				name: config.SENDGRID_FROM_NAME,
			},
			subject: content.subject,
			html: htmlContent,
		});
		log.info({ email: toEmail, locale }, "OAuth notification email sent successfully");
	} catch (error) {
		log.error({ error, email: toEmail }, "Failed to send OAuth notification email");
		throw error;
	}
}

/**
 * Generate the HTML content for OAuth notification email
 */
function generateOAuthNotificationEmailHtml(data: { loginUrl: string; locale: EmailLocale }): string {
	const content = getOAuthNotificationEmailContent(data.locale);
	return `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${content.title}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
	<div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
		<h1 style="color: #007bff; margin-top: 0;">${content.title}</h1>
		<p>${content.greeting}</p>
		<p>${content.message}</p>
		<p>${content.instructions}</p>

		<div style="text-align: center; margin: 30px 0;">
			<a href="${data.loginUrl}"
			   style="background-color: #007bff;
			          color: white;
			          padding: 12px 30px;
			          text-decoration: none;
			          border-radius: 5px;
			          display: inline-block;
			          font-weight: bold;">
				${content.buttonText}
			</a>
		</div>

		<hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

		<p style="color: #666; font-size: 14px;">
			${content.securityNotice}
		</p>

		<p style="color: #666; font-size: 14px;">
			${content.closing}
		</p>
	</div>
</body>
</html>
	`.trim();
}

/**
 * Parameters for sending an invitation email
 */
export interface SendInvitationEmailParams {
	toEmail: string;
	toName: string | null;
	invitationUrl: string;
	organizationName: string;
	inviterName: string;
	role: string;
	expiresInDays: number;
}

/**
 * Send an invitation email via SendGrid
 */
export async function sendInvitationEmail(params: SendInvitationEmailParams): Promise<void> {
	const config = getConfig();

	if (!config.SENDGRID_API_KEY || !config.SENDGRID_FROM_EMAIL) {
		log.warn("SendGrid not configured, skipping invitation email");
		return;
	}

	sgMail.setApiKey(config.SENDGRID_API_KEY);

	const htmlContent = generateInvitationEmailHtml({
		userName: params.toName || "there",
		invitationUrl: params.invitationUrl,
		organizationName: params.organizationName,
		inviterName: params.inviterName,
		role: params.role,
		expiresInDays: params.expiresInDays,
	});

	try {
		await sgMail.send({
			to: params.toEmail,
			from: {
				email: config.SENDGRID_FROM_EMAIL,
				name: config.SENDGRID_FROM_NAME,
			},
			subject: `You're invited to join ${params.organizationName} on Jolli`,
			html: htmlContent,
		});
		log.info(
			{ email: params.toEmail, organization: params.organizationName },
			"Invitation email sent successfully",
		);
	} catch (error) {
		log.error({ error, email: params.toEmail }, "Failed to send invitation email");
		throw error;
	}
}

/**
 * Generate the HTML content for invitation email
 */
function generateInvitationEmailHtml(data: {
	userName: string;
	invitationUrl: string;
	organizationName: string;
	inviterName: string;
	role: string;
	expiresInDays: number;
}): string {
	const roleDisplay = data.role.charAt(0).toUpperCase() + data.role.slice(1);
	return `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>You're Invited to Join ${data.organizationName}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
	<div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
		<h1 style="color: #007bff; margin-top: 0;">You're Invited!</h1>
		<p>Hi ${data.userName},</p>
		<p><strong>${data.inviterName}</strong> has invited you to join <strong>${data.organizationName}</strong> on Jolli as a <strong>${roleDisplay}</strong>.</p>

		<div style="text-align: center; margin: 30px 0;">
			<a href="${data.invitationUrl}"
			   style="background-color: #007bff;
			          color: white;
			          padding: 12px 30px;
			          text-decoration: none;
			          border-radius: 5px;
			          display: inline-block;
			          font-weight: bold;">
				Accept Invitation
			</a>
		</div>

		<p>This invitation will expire in <strong>${data.expiresInDays} days</strong>.</p>

		<p>If the button doesn't work, copy and paste this link into your browser:</p>
		<p style="word-break: break-all; color: #007bff;">${data.invitationUrl}</p>

		<hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

		<p style="color: #666; font-size: 14px;">
			If you didn't expect this invitation, you can safely ignore this email.
		</p>

		<p style="color: #666; font-size: 14px;">
			Best regards,<br>
			The Jolli Team
		</p>
	</div>
</body>
</html>
	`.trim();
}

/**
 * Parameters for sending an owner invitation email
 */
export interface SendOwnerInvitationEmailParams {
	toEmail: string;
	toName: string | null;
	invitationUrl: string;
	tenantName: string;
	organizationName: string;
	inviterName: string;
	expiresInDays: number;
	/** Whether the user already exists in the system */
	userExists: boolean;
}

/**
 * Send an owner invitation email via SendGrid.
 * Uses different templates for new users (create account) vs existing users (accept/decline).
 */
export async function sendOwnerInvitationEmail(params: SendOwnerInvitationEmailParams): Promise<void> {
	const config = getConfig();

	if (!config.SENDGRID_API_KEY || !config.SENDGRID_FROM_EMAIL) {
		log.warn("SendGrid not configured, skipping owner invitation email");
		return;
	}

	sgMail.setApiKey(config.SENDGRID_API_KEY);

	const htmlContent = params.userExists
		? generateOwnerInvitationExistingUserEmailHtml({
				userName: params.toName || "there",
				invitationUrl: params.invitationUrl,
				tenantName: params.tenantName,
				organizationName: params.organizationName,
				inviterName: params.inviterName,
				expiresInDays: params.expiresInDays,
			})
		: generateOwnerInvitationNewUserEmailHtml({
				userName: params.toName || "there",
				invitationUrl: params.invitationUrl,
				tenantName: params.tenantName,
				organizationName: params.organizationName,
				inviterName: params.inviterName,
				expiresInDays: params.expiresInDays,
			});

	try {
		await sgMail.send({
			to: params.toEmail,
			from: {
				email: config.SENDGRID_FROM_EMAIL,
				name: config.SENDGRID_FROM_NAME,
			},
			subject: `You've been invited as owner of ${params.organizationName} on Jolli`,
			html: htmlContent,
		});
		log.info(
			{ email: params.toEmail, organization: params.organizationName, userExists: params.userExists },
			"Owner invitation email sent successfully",
		);
	} catch (error) {
		log.error({ error, email: params.toEmail }, "Failed to send owner invitation email");
		throw error;
	}
}

/**
 * Generate the HTML content for owner invitation email (new user - needs to create account)
 */
function generateOwnerInvitationNewUserEmailHtml(data: {
	userName: string;
	invitationUrl: string;
	tenantName: string;
	organizationName: string;
	inviterName: string;
	expiresInDays: number;
}): string {
	return `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>You've Been Invited as Owner of ${data.organizationName}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
	<div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
		<h1 style="color: #007bff; margin-top: 0;">You're Invited to Be an Owner!</h1>
		<p>Hi ${data.userName},</p>
		<p><strong>${data.inviterName}</strong> has invited you to become the <strong>Owner</strong> of <strong>${data.organizationName}</strong> (${data.tenantName}) on Jolli.</p>

		<p>As an owner, you'll have full administrative control over the organization.</p>

		<p>To accept this invitation, you'll need to create a Jolli account. Click the button below to get started:</p>

		<div style="text-align: center; margin: 30px 0;">
			<a href="${data.invitationUrl}"
			   style="background-color: #007bff;
			          color: white;
			          padding: 12px 30px;
			          text-decoration: none;
			          border-radius: 5px;
			          display: inline-block;
			          font-weight: bold;">
				Create Account & Accept
			</a>
		</div>

		<p>This invitation will expire in <strong>${data.expiresInDays} days</strong>.</p>

		<p>If the button doesn't work, copy and paste this link into your browser:</p>
		<p style="word-break: break-all; color: #007bff;">${data.invitationUrl}</p>

		<hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

		<p style="color: #666; font-size: 14px;">
			If you didn't expect this invitation or don't want to accept it, you can safely ignore this email.
		</p>

		<p style="color: #666; font-size: 14px;">
			Best regards,<br>
			The Jolli Team
		</p>
	</div>
</body>
</html>
	`.trim();
}

/**
 * Generate the HTML content for owner invitation email (existing user - just needs to accept)
 */
function generateOwnerInvitationExistingUserEmailHtml(data: {
	userName: string;
	invitationUrl: string;
	tenantName: string;
	organizationName: string;
	inviterName: string;
	expiresInDays: number;
}): string {
	return `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>You've Been Invited as Owner of ${data.organizationName}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
	<div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
		<h1 style="color: #007bff; margin-top: 0;">You're Invited to Be an Owner!</h1>
		<p>Hi ${data.userName},</p>
		<p><strong>${data.inviterName}</strong> has invited you to become the <strong>Owner</strong> of <strong>${data.organizationName}</strong> (${data.tenantName}) on Jolli.</p>

		<p>As an owner, you'll have full administrative control over the organization.</p>

		<p>Click the button below to review and accept this invitation:</p>

		<div style="text-align: center; margin: 30px 0;">
			<a href="${data.invitationUrl}"
			   style="background-color: #007bff;
			          color: white;
			          padding: 12px 30px;
			          text-decoration: none;
			          border-radius: 5px;
			          display: inline-block;
			          font-weight: bold;">
				Accept Ownership
			</a>
		</div>

		<p>This invitation will expire in <strong>${data.expiresInDays} days</strong>.</p>

		<p>If the button doesn't work, copy and paste this link into your browser:</p>
		<p style="word-break: break-all; color: #007bff;">${data.invitationUrl}</p>

		<hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

		<p style="color: #666; font-size: 14px;">
			If you don't want to accept this invitation, you can decline it from the link above or simply ignore this email.
		</p>

		<p style="color: #666; font-size: 14px;">
			Best regards,<br>
			The Jolli Team
		</p>
	</div>
</body>
</html>
	`.trim();
}

/**
 * Parameters for sending a security alert email
 */
export interface SendSecurityAlertEmailParams {
	toEmail: string;
	toName: string | null;
	/** Type of security alert */
	alertType: "token_theft";
	/** IP address where the suspicious activity originated */
	ipAddress?: string;
	/** User agent of the suspicious request */
	userAgent?: string;
	/** URL for the user to review their account security */
	securityReviewUrl: string;
	locale?: EmailLocale;
}

/**
 * Send a security alert email when suspicious activity is detected
 */
export async function sendSecurityAlertEmail(params: SendSecurityAlertEmailParams): Promise<void> {
	const config = getConfig();

	if (!config.SENDGRID_API_KEY || !config.SENDGRID_FROM_EMAIL) {
		log.warn("SendGrid not configured, skipping security alert email");
		return;
	}

	sgMail.setApiKey(config.SENDGRID_API_KEY);

	const locale = params.locale || "en";
	const content = getSecurityAlertEmailContent(locale);

	const htmlContent = generateSecurityAlertEmailHtml({
		userName: params.toName || "User",
		alertType: params.alertType,
		securityReviewUrl: params.securityReviewUrl,
		locale,
		...(params.ipAddress && { ipAddress: params.ipAddress }),
		...(params.userAgent && { userAgent: params.userAgent }),
	});

	try {
		await sgMail.send({
			to: params.toEmail,
			from: {
				email: config.SENDGRID_FROM_EMAIL,
				name: config.SENDGRID_FROM_NAME,
			},
			subject: content.subject,
			html: htmlContent,
		});
		log.info(
			{ email: params.toEmail, alertType: params.alertType, locale },
			"Security alert email sent successfully",
		);
	} catch (error) {
		log.error({ error, email: params.toEmail, alertType: params.alertType }, "Failed to send security alert email");
		// Don't throw - security alert email failure shouldn't break the flow
	}
}

/**
 * Generate the HTML content for security alert email
 */
function generateSecurityAlertEmailHtml(data: {
	userName: string;
	alertType: "token_theft";
	ipAddress?: string;
	userAgent?: string;
	securityReviewUrl: string;
	locale: EmailLocale;
}): string {
	const content = getSecurityAlertEmailContent(data.locale);
	const recommendationsList = content.recommendations.map(r => `<li>${r}</li>`).join("\n");

	const detailsHtml =
		data.ipAddress || data.userAgent
			? `
		<p><strong>${content.detailsTitle}</strong></p>
		<ul style="color: #666;">
			${data.ipAddress ? `<li>IP Address: ${data.ipAddress}</li>` : ""}
			${data.userAgent ? `<li>Device: ${data.userAgent.substring(0, 100)}</li>` : ""}
		</ul>
	`
			: "";

	return `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${content.title}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
	<div style="background-color: #fff3cd; padding: 20px; border-radius: 5px; border-left: 4px solid #ffc107;">
		<h1 style="color: #856404; margin-top: 0;">⚠️ ${content.title}</h1>
		<p>${content.greeting(data.userName)}</p>
		<p>${content.intro}</p>
		<p>${content.theftDetected}</p>
		<p>${content.actionTaken}</p>

		${detailsHtml}

		<p><strong>${content.recommendationsTitle}</strong></p>
		<ul>
			${recommendationsList}
		</ul>

		<div style="text-align: center; margin: 30px 0;">
			<a href="${data.securityReviewUrl}"
			   style="background-color: #ffc107;
			          color: #856404;
			          padding: 12px 30px;
			          text-decoration: none;
			          border-radius: 5px;
			          display: inline-block;
			          font-weight: bold;">
				${content.buttonText}
			</a>
		</div>

		<hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

		<p style="color: #666; font-size: 14px;">
			${content.securityNotice}
		</p>

		<p style="color: #666; font-size: 14px;">
			${content.closing}
		</p>
	</div>
</body>
</html>
	`.trim();
}
