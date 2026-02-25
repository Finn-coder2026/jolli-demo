import { type Dictionary, t } from "intlayer";

const forgotPasswordPageContent = {
	key: "forgotPasswordPage",
	content: {
		// Page titles
		forgotPassword: t({
			en: "Forgot Password",
			es: "Olvidé mi Contraseña",
		}),
		checkYourEmail: t({
			en: "Check Your Email",
			es: "Revisa tu Correo",
		}),

		// Form labels and placeholders
		emailPlaceholder: t({
			en: "Email",
			es: "Correo Electrónico",
		}),

		// Instructions
		enterEmailInstruction: t({
			en: "Enter your email to receive a password reset link.",
			es: "Ingresa tu correo electrónico para recibir un enlace de restablecimiento de contraseña.",
		}),
		emailSentMessage: t({
			en: "If an account exists with that email address, we've sent password reset instructions to",
			es: "Si existe una cuenta con esa dirección de correo, hemos enviado instrucciones de restablecimiento a",
		}),
		checkInboxInstruction: t({
			en: "Please check your inbox and spam folder.",
			es: "Por favor revisa tu bandeja de entrada y carpeta de spam.",
		}),
		linkExpiryMessage: t({
			en: "If you don't receive an email within a few minutes, the email address may not be registered, or your account may use social login.",
			es: "Si no recibes un correo en unos minutos, es posible que el correo no esté registrado o que tu cuenta use inicio de sesión social.",
		}),

		// Buttons
		nextButton: t({
			en: "Next",
			es: "Siguiente",
		}),
		sendingButton: t({
			en: "Sending...",
			es: "Enviando...",
		}),
		backToLogin: t({
			en: "Back to Login",
			es: "Volver al Inicio de Sesión",
		}),

		// Validation errors
		emailRequired: t({
			en: "Email is required",
			es: "El correo electrónico es requerido",
		}),
		invalidEmail: t({
			en: "Please enter a valid email address",
			es: "Por favor ingresa una dirección de correo válida",
		}),

		// Error messages
		resetEmailFailed: t({
			en: "Failed to send reset email. Please try again.",
			es: "Error al enviar el correo de restablecimiento. Por favor intenta de nuevo.",
		}),
	},
} satisfies Dictionary;

export default forgotPasswordPageContent;
