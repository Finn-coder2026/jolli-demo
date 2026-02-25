import { type Dictionary, t } from "intlayer";

/**
 * Localization content for the Accept Invitation page
 */
const acceptInvitationContent = {
	key: "acceptInvitation",
	content: {
		// Page title
		pageTitle: t({
			en: "Accept Invitation",
			es: "Aceptar Invitacion",
		}),

		// Validation states
		validating: t({
			en: "Validating invitation...",
			es: "Validando invitacion...",
		}),

		// Invitation details
		invitedToJoin: t({
			en: "You've been invited to join",
			es: "Has sido invitado a unirte a",
		}),
		asRole: t({
			en: "as",
			es: "como",
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
		createAccount: t({
			en: "Create Account",
			es: "Crear Cuenta",
		}),
		creatingAccount: t({
			en: "Creating Account...",
			es: "Creando Cuenta...",
		}),
		backToLogin: t({
			en: "Back to Login",
			es: "Volver al Inicio de Sesion",
		}),

		// Success state
		accountCreated: t({
			en: "Welcome!",
			es: "¡Bienvenido!",
		}),
		successMessage: t({
			en: "You have successfully joined the organization. You will be redirected...",
			es: "Te has unido exitosamente a la organización. Serás redirigido...",
		}),
		goToLogin: t({
			en: "Go to Login Now",
			es: "Ir a Iniciar Sesion",
		}),

		// Error messages
		invalidToken: t({
			en: "The invitation link is invalid.",
			es: "El enlace de invitacion es invalido.",
		}),
		expiredToken: t({
			en: "This invitation has expired. Please request a new invitation.",
			es: "Esta invitacion ha expirado. Por favor solicita una nueva invitacion.",
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
		userExists: t({
			en: "An account with this email already exists. Please use the login page.",
			es: "Ya existe una cuenta con este correo electronico. Por favor usa la pagina de inicio de sesion.",
		}),
		existingUserPasswordMessage: t({
			en: "Your account already exists. Enter your password to accept this invitation.",
			es: "Tu cuenta ya existe. Ingresa tu contrasena para aceptar esta invitacion.",
		}),
		existingUserNoPasswordMessage: t({
			en: "We found your account, but you don't have a password yet. Set one to accept this invitation.",
			es: "Encontramos tu cuenta, pero aun no tienes contrasena. Crea una para aceptar esta invitacion.",
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

		// Role names
		roleOwner: t({
			en: "Owner",
			es: "Propietario",
		}),
		roleAdmin: t({
			en: "Admin",
			es: "Administrador",
		}),
		roleMember: t({
			en: "Member",
			es: "Miembro",
		}),

		// OAuth options
		orSignUpWith: t({
			en: "Or sign up with",
			es: "O registrate con",
		}),
		orSignInWith: t({
			en: "Or sign in with",
			es: "O inicia sesion con",
		}),
		acceptWithPassword: t({
			en: "Accept with Password",
			es: "Aceptar con Contrasena",
		}),
		acceptingWithPassword: t({
			en: "Accepting...",
			es: "Aceptando...",
		}),
		setPasswordToAccept: t({
			en: "Set Password and Accept",
			es: "Crear Contrasena y Aceptar",
		}),
		settingPasswordToAccept: t({
			en: "Setting Password...",
			es: "Creando Contrasena...",
		}),
		signUpWithGoogle: t({
			en: "Sign up with Google",
			es: "Registrarse con Google",
		}),
		signUpWithGitHub: t({
			en: "Sign up with GitHub",
			es: "Registrarse con GitHub",
		}),
		signInWithGoogle: t({
			en: "Sign in with Google",
			es: "Iniciar sesion con Google",
		}),
		signInWithGitHub: t({
			en: "Sign in with GitHub",
			es: "Iniciar sesion con GitHub",
		}),
		completingOAuth: t({
			en: "Completing registration...",
			es: "Completando registro...",
		}),
		oauthSessionFailed: t({
			en: "Failed to establish OAuth session. Please try again or use password signup.",
			es: "No se pudo establecer la sesion OAuth. Intenta de nuevo o usa el registro con contrasena.",
		}),
	},
} satisfies Dictionary;

export default acceptInvitationContent;
