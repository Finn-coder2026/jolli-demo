/**
 * Email internationalization content
 * Centralized location for all email template translations
 */

/**
 * Supported email locales
 */
export type EmailLocale = "en" | "es";

/**
 * Password reset email content by locale
 */
export const passwordResetEmailContent = {
	en: {
		subject: "Reset Your Password - Jolli",
		defaultUserName: "User",
		title: "Reset Your Password",
		greeting: (name: string) => `Hi ${name},`,
		intro: "We received a request to reset your password for your Jolli account. Click the button below to reset your password:",
		buttonText: "Reset Password",
		expiryNotice: "This link will expire in <strong>1 hour</strong>.",
		manualLinkInstructions: "If the button doesn't work, copy and paste this link into your browser:",
		securityNotice: "If you didn't request this password reset, please ignore this email.",
		closing: "Best regards,<br>The Jolli Team",
	},
	es: {
		subject: "Restablece tu Contraseña - Jolli",
		defaultUserName: "Usuario",
		title: "Restablece tu Contraseña",
		greeting: (name: string) => `Hola ${name},`,
		intro: "Recibimos una solicitud para restablecer tu contraseña de tu cuenta de Jolli. Haz clic en el botón de abajo para restablecer tu contraseña:",
		buttonText: "Restablecer Contraseña",
		expiryNotice: "Este enlace expirará en <strong>1 hora</strong>.",
		manualLinkInstructions: "Si el botón no funciona, copia y pega este enlace en tu navegador:",
		securityNotice: "Si no solicitaste este restablecimiento de contraseña, ignora este correo.",
		closing: "Saludos cordiales,<br>El Equipo de Jolli",
	},
} as const;

/**
 * OAuth notification email content by locale
 */
export const oauthNotificationEmailContent = {
	en: {
		subject: "About Your Account Login - Jolli",
		title: "About Your Account Login",
		greeting: "Hello,",
		message:
			"We received a password reset request for this email address. However, your account uses <strong>social login</strong> instead of a password.",
		instructions:
			"To access your account, please return to the login page and click on the social login button you used when you created your account.",
		buttonText: "Go to Login Page",
		securityNotice: "If you didn't request a password reset, you can safely ignore this email.",
		closing: "Best regards,<br>The Jolli Team",
	},
	es: {
		subject: "Acerca del Inicio de Sesión de tu Cuenta - Jolli",
		title: "Acerca del Inicio de Sesión de tu Cuenta",
		greeting: "Hola,",
		message:
			"Recibimos una solicitud de restablecimiento de contraseña para esta dirección de correo. Sin embargo, tu cuenta usa <strong>inicio de sesión social</strong> en lugar de una contraseña.",
		instructions:
			"Para acceder a tu cuenta, regresa a la página de inicio de sesión y haz clic en el botón de inicio de sesión social que usaste cuando creaste tu cuenta.",
		buttonText: "Ir a la Página de Inicio de Sesión",
		securityNotice:
			"Si no solicitaste un restablecimiento de contraseña, puedes ignorar este correo con seguridad.",
		closing: "Saludos cordiales,<br>El Equipo de Jolli",
	},
} as const;

/**
 * Get password reset email content for a specific locale
 */
export function getPasswordResetEmailContent(locale: EmailLocale) {
	return passwordResetEmailContent[locale];
}

/**
 * Get OAuth notification email content for a specific locale
 */
export function getOAuthNotificationEmailContent(locale: EmailLocale) {
	return oauthNotificationEmailContent[locale];
}

/**
 * Security alert email content by locale (for token theft detection, etc.)
 */
export const securityAlertEmailContent = {
	en: {
		subject: "Security Alert - Suspicious Activity Detected - Jolli",
		title: "Security Alert",
		greeting: (name: string) => `Hi ${name},`,
		intro: "We detected suspicious activity on your Jolli account.",
		theftDetected:
			"A login token that was previously used on your account was presented with an invalid signature. This could indicate that someone copied your login credentials.",
		actionTaken: "<strong>For your protection, we have automatically signed you out of all devices.</strong>",
		recommendations: [
			"If you didn't attempt to log in from a new device, please change your password immediately.",
			"Review your account settings for any unauthorized changes.",
			"Enable two-factor authentication if you haven't already.",
		],
		recommendationsTitle: "We recommend:",
		buttonText: "Review Account Security",
		detailsTitle: "Details:",
		securityNotice:
			"If you recognize this activity and it was you, you can safely ignore this email and log in again.",
		closing: "Best regards,<br>The Jolli Security Team",
	},
	es: {
		subject: "Alerta de Seguridad - Actividad Sospechosa Detectada - Jolli",
		title: "Alerta de Seguridad",
		greeting: (name: string) => `Hola ${name},`,
		intro: "Detectamos actividad sospechosa en tu cuenta de Jolli.",
		theftDetected:
			"Un token de inicio de sesión que se usó previamente en tu cuenta se presentó con una firma inválida. Esto podría indicar que alguien copió tus credenciales de inicio de sesión.",
		actionTaken:
			"<strong>Para tu protección, te hemos cerrado automáticamente la sesión en todos los dispositivos.</strong>",
		recommendations: [
			"Si no intentaste iniciar sesión desde un nuevo dispositivo, cambia tu contraseña inmediatamente.",
			"Revisa la configuración de tu cuenta para detectar cambios no autorizados.",
			"Habilita la autenticación de dos factores si aún no lo has hecho.",
		],
		recommendationsTitle: "Te recomendamos:",
		buttonText: "Revisar Seguridad de la Cuenta",
		detailsTitle: "Detalles:",
		securityNotice:
			"Si reconoces esta actividad y fuiste tú, puedes ignorar este correo e iniciar sesión nuevamente.",
		closing: "Saludos cordiales,<br>El Equipo de Seguridad de Jolli",
	},
} as const;

/**
 * Get security alert email content for a specific locale
 */
export function getSecurityAlertEmailContent(locale: EmailLocale) {
	return securityAlertEmailContent[locale];
}
