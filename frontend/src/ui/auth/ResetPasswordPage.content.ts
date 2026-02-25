import { type Dictionary, t } from "intlayer";

const resetPasswordPageContent = {
	key: "resetPasswordPage",
	content: {
		// Page titles
		resetPassword: t({
			en: "Reset Password",
			es: "Restablecer Contraseña",
		}),
		passwordResetSuccessful: t({
			en: "Password Reset Successful!",
			es: "¡Contraseña Restablecida Exitosamente!",
		}),

		// Instructions
		enterNewPassword: t({
			en: "Enter your new password below.",
			es: "Ingresa tu nueva contraseña a continuación.",
		}),
		validatingLink: t({
			en: "Validating reset link...",
			es: "Validando enlace de restablecimiento...",
		}),
		passwordRequirements: t({
			en: "Must be 8-36 characters with uppercase, lowercase, number, and special character",
			es: "Debe tener 8-36 caracteres con mayúscula, minúscula, número y carácter especial",
		}),
		successMessage: t({
			en: "Your password has been successfully reset. You will be redirected to the login page...",
			es: "Tu contraseña ha sido restablecida exitosamente. Serás redirigido a la página de inicio de sesión...",
		}),

		// Form labels and placeholders
		newPasswordPlaceholder: t({
			en: "New Password",
			es: "Nueva Contraseña",
		}),
		confirmPasswordPlaceholder: t({
			en: "Confirm Password",
			es: "Confirmar Contraseña",
		}),

		// Buttons
		resetButton: t({
			en: "Reset Password",
			es: "Restablecer Contraseña",
		}),
		resettingButton: t({
			en: "Resetting...",
			es: "Restableciendo...",
		}),
		backToLogin: t({
			en: "Back to Login",
			es: "Volver al Inicio de Sesión",
		}),
		goToLoginNow: t({
			en: "Go to Login Now",
			es: "Ir al Inicio de Sesión Ahora",
		}),
		requestNewResetLink: t({
			en: "Request New Reset Link",
			es: "Solicitar Nuevo Enlace de Restablecimiento",
		}),

		// Validation errors
		invalidOrMissingToken: t({
			en: "Invalid or missing reset token. Please request a new password reset.",
			es: "Token de restablecimiento inválido o faltante. Por favor solicita un nuevo restablecimiento de contraseña.",
		}),
		failedToValidate: t({
			en: "Failed to validate reset link. Please try again later.",
			es: "Error al validar el enlace de restablecimiento. Por favor intenta de nuevo más tarde.",
		}),
		passwordMinLength: t({
			en: "Password must be at least 8 characters",
			es: "La contraseña debe tener al menos 8 caracteres",
		}),
		passwordMaxLength: t({
			en: "Password must be at most 36 characters",
			es: "La contraseña debe tener como máximo 36 caracteres",
		}),
		passwordNeedsUppercase: t({
			en: "Password must contain at least one uppercase letter",
			es: "La contraseña debe contener al menos una letra mayúscula",
		}),
		passwordNeedsLowercase: t({
			en: "Password must contain at least one lowercase letter",
			es: "La contraseña debe contener al menos una letra minúscula",
		}),
		passwordNeedsNumber: t({
			en: "Password must contain at least one number",
			es: "La contraseña debe contener al menos un número",
		}),
		passwordNeedsSpecial: t({
			en: "Password must contain at least one special character",
			es: "La contraseña debe contener al menos un carácter especial",
		}),
		passwordsDoNotMatch: t({
			en: "Passwords do not match",
			es: "Las contraseñas no coinciden",
		}),
		invalidResetToken: t({
			en: "Invalid reset token",
			es: "Token de restablecimiento inválido",
		}),

		// Error messages
		expiredToken: t({
			en: "This reset link has expired. Please request a new password reset.",
			es: "Este enlace de restablecimiento ha expirado. Por favor solicita un nuevo restablecimiento de contraseña.",
		}),
		usedToken: t({
			en: "This reset link has already been used. Please request a new password reset.",
			es: "Este enlace de restablecimiento ya ha sido usado. Por favor solicita un nuevo restablecimiento de contraseña.",
		}),
		invalidToken: t({
			en: "This reset link is invalid. Please request a new password reset.",
			es: "Este enlace de restablecimiento es inválido. Por favor solicita un nuevo restablecimiento de contraseña.",
		}),
		passwordReused: t({
			en: "This password was used recently. Please choose a different password.",
			es: "Esta contraseña fue usada recientemente. Por favor elige una contraseña diferente.",
		}),
		failedToReset: t({
			en: "Failed to reset password. Please try again later.",
			es: "Error al restablecer la contraseña. Por favor intenta de nuevo más tarde.",
		}),
	},
} satisfies Dictionary;

export default resetPasswordPageContent;
