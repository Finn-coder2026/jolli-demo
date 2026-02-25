import { type Dictionary, t } from "intlayer";

/**
 * Localization content for the Accept Owner Invitation page
 */
const acceptOwnerInvitationContent = {
	key: "acceptOwnerInvitation",
	content: {
		// Page title
		pageTitle: t({
			en: "Owner Invitation",
			es: "Invitacion de Propietario",
		}),

		// Validation states
		validating: t({
			en: "Validating invitation...",
			es: "Validando invitacion...",
		}),

		// Invitation details
		invitedToOwn: t({
			en: "You've been invited to become the owner of",
			es: "Has sido invitado a convertirte en propietario de",
		}),
		inTenant: t({
			en: "in",
			es: "en",
		}),

		// Form labels
		email: t({
			en: "Email",
			es: "Correo electronico",
		}),
		name: t({
			en: "Full Name",
			es: "Nombre Completo",
		}),
		namePlaceholder: t({
			en: "Enter your name",
			es: "Ingresa tu nombre",
		}),
		password: t({
			en: "Password",
			es: "Contrasena",
		}),
		confirmPassword: t({
			en: "Confirm Password",
			es: "Confirmar Contrasena",
		}),
		passwordHint: t({
			en: "Must be 8-36 characters with uppercase, lowercase, number, and special character",
			es: "Debe tener 8-36 caracteres con mayusculas, minusculas, numero y caracter especial",
		}),

		// Buttons
		acceptInvitation: t({
			en: "Accept Invitation",
			es: "Aceptar Invitacion",
		}),
		acceptWithPassword: t({
			en: "Sign In & Accept",
			es: "Iniciar Sesion y Aceptar",
		}),
		accepting: t({
			en: "Accepting...",
			es: "Aceptando...",
		}),
		declineInvitation: t({
			en: "Decline",
			es: "Rechazar",
		}),
		declining: t({
			en: "Declining...",
			es: "Rechazando...",
		}),
		backToHome: t({
			en: "Back to Home",
			es: "Volver al Inicio",
		}),

		// Success state
		invitationAccepted: t({
			en: "Invitation Accepted!",
			es: "Invitacion Aceptada!",
		}),
		successMessage: t({
			en: "You are now the owner of this organization. You will be redirected to sign in...",
			es: "Ahora eres el propietario de esta organizacion. Seras redirigido para iniciar sesion...",
		}),
		successMessageOAuth: t({
			en: "You are now the owner of this organization. You will be redirected to your dashboard...",
			es: "Ahora eres el propietario de esta organizacion. Seras redirigido a tu panel...",
		}),
		goToLogin: t({
			en: "Go to Login Now",
			es: "Ir a Iniciar Sesion",
		}),
		goToDashboard: t({
			en: "Go to Dashboard",
			es: "Ir al Panel",
		}),

		// Declined state
		invitationDeclined: t({
			en: "Invitation Declined",
			es: "Invitacion Rechazada",
		}),
		declineMessage: t({
			en: "You have declined the owner invitation. The organization administrator will be notified.",
			es: "Has rechazado la invitacion de propietario. El administrador de la organizacion sera notificado.",
		}),

		// Error messages
		invalidToken: t({
			en: "The invitation link is invalid.",
			es: "El enlace de invitacion es invalido.",
		}),
		expiredToken: t({
			en: "This invitation has expired. Please request a new invitation from the administrator.",
			es: "Esta invitacion ha expirado. Por favor solicita una nueva invitacion al administrador.",
		}),
		usedToken: t({
			en: "This invitation has already been used.",
			es: "Esta invitacion ya ha sido utilizada.",
		}),
		invitationNotFound: t({
			en: "Invitation not found. Please check your invitation link.",
			es: "Invitacion no encontrada. Por favor verifica tu enlace de invitacion.",
		}),
		serverError: t({
			en: "An error occurred. Please try again later.",
			es: "Ocurrio un error. Por favor intenta de nuevo mas tarde.",
		}),
		passwordMismatch: t({
			en: "Passwords do not match",
			es: "Las contrasenas no coinciden",
		}),
		emailMismatch: t({
			en: "This invitation is for a different email address. Please sign in with the invited email.",
			es: "Esta invitacion es para una direccion de correo diferente. Por favor inicia sesion con el correo invitado.",
		}),

		// Password validation errors
		passwordRequired: t({
			en: "Password is required",
			es: "La contrasena es requerida",
		}),
		passwordTooShort: t({
			en: "Password must be at least 8 characters",
			es: "La contrasena debe tener al menos 8 caracteres",
		}),
		passwordTooLong: t({
			en: "Password must be at most 36 characters",
			es: "La contrasena no debe exceder 36 caracteres",
		}),
		passwordNeedsUppercase: t({
			en: "Password must contain at least one uppercase letter",
			es: "La contrasena debe contener al menos una letra mayuscula",
		}),
		passwordNeedsLowercase: t({
			en: "Password must contain at least one lowercase letter",
			es: "La contrasena debe contener al menos una letra minuscula",
		}),
		passwordNeedsNumber: t({
			en: "Password must contain at least one number",
			es: "La contrasena debe contener al menos un numero",
		}),
		passwordNeedsSpecialChar: t({
			en: "Password must contain at least one special character",
			es: "La contrasena debe contener al menos un caracter especial",
		}),
		passwordContainsEmail: t({
			en: "Password must not contain your email address",
			es: "La contrasena no debe contener tu correo electronico",
		}),

		// Existing user messages
		existingUserMessage: t({
			en: "You already have an account. Sign in to accept this invitation.",
			es: "Ya tienes una cuenta. Inicia sesion para aceptar esta invitacion.",
		}),

		// OAuth options
		orAcceptWith: t({
			en: "Or accept with",
			es: "O acepta con",
		}),
		acceptWithGoogle: t({
			en: "Accept with Google",
			es: "Aceptar con Google",
		}),
		acceptWithGitHub: t({
			en: "Accept with GitHub",
			es: "Aceptar con GitHub",
		}),
		completingOAuth: t({
			en: "Completing acceptance...",
			es: "Completando aceptacion...",
		}),
		oauthSessionFailed: t({
			en: "Failed to establish OAuth session. Please try again.",
			es: "No se pudo establecer la sesion OAuth. Intenta de nuevo.",
		}),
	},
} satisfies Dictionary;

export default acceptOwnerInvitationContent;
