import { type Dictionary, t } from "intlayer";

/**
 * Localization content for authentication UI
 */
const authContent = {
	key: "auth",
	content: {
		// Login Page - Branding
		brandName: t({
			en: "Jolli",
			es: "Jolli",
		}),
		tagline: t({
			en: "Documentation Intelligence",
			es: "Inteligencia de Documentación",
		}),
		loginTitle: t({
			en: "Documentation Intelligence",
			es: "Inteligencia de Documentación",
		}),
		email: t({
			en: "Email",
			es: "Correo electrónico",
		}),
		password: t({
			en: "Password",
			es: "Contraseña",
		}),
		login: t({
			en: "Sign In",
			es: "Iniciar sesión",
		}),
		loggingIn: t({
			en: "Signing in...",
			es: "Iniciando sesión...",
		}),
		orLoginWith: t({
			en: "or continue with",
			es: "o continuar con",
		}),
		loginWithGoogle: t({
			en: "Login with Google",
			es: "Iniciar sesión con Google",
		}),
		loginWithGitHub: t({
			en: "Login with GitHub",
			es: "Iniciar sesión con GitHub",
		}),

		// Error messages
		loginError: t({
			en: "Login failed. Please try again.",
			es: "Error al iniciar sesión. Por favor, inténtalo de nuevo.",
		}),
		loginFailed: t({
			en: "Invalid email or password.",
			es: "Correo electrónico o contraseña inválidos.",
		}),
		accountLocked: t({
			en: "Account temporarily locked due to too many failed attempts. Please try again later.",
			es: "Cuenta bloqueada temporalmente debido a demasiados intentos fallidos. Inténtalo de nuevo más tarde.",
		}),
		accountInactive: t({
			en: "Your account has been deactivated. Please contact your administrator.",
			es: "Su cuenta ha sido desactivada. Comuníquese con su administrador.",
		}),
		rateLimitExceeded: t({
			en: "Too many login attempts. Please try again later.",
			es: "Demasiados intentos de inicio de sesión. Inténtalo de nuevo más tarde.",
		}),

		// Email validation errors
		emailRequired: t({
			en: "Email is required.",
			es: "El correo electrónico es obligatorio.",
		}),
		emailInvalid: t({
			en: "Please enter a valid email address.",
			es: "Por favor, ingresa una dirección de correo electrónico válida.",
		}),

		// Password validation errors
		passwordRequired: t({
			en: "Password is required.",
			es: "La contraseña es obligatoria.",
		}),
		passwordTooShort: t({
			en: "Password must be at least 8 characters long.",
			es: "La contraseña debe tener al menos 8 caracteres.",
		}),
		passwordTooLong: t({
			en: "Password must not exceed 36 characters.",
			es: "La contraseña no debe exceder 36 caracteres.",
		}),
		passwordNeedsUppercase: t({
			en: "Password must contain at least one uppercase letter.",
			es: "La contraseña debe contener al menos una letra mayúscula.",
		}),
		passwordNeedsLowercase: t({
			en: "Password must contain at least one lowercase letter.",
			es: "La contraseña debe contener al menos una letra minúscula.",
		}),
		passwordNeedsNumber: t({
			en: "Password must contain at least one number.",
			es: "La contraseña debe contener al menos un número.",
		}),
		passwordNeedsSpecialChar: t({
			en: "Password must contain at least one special character (!@#$%^&*...).",
			es: "La contraseña debe contener al menos un carácter especial (!@#$%^&*...).",
		}),
		passwordContainsEmail: t({
			en: "Password must not contain your email address.",
			es: "La contraseña no debe contener tu dirección de correo electrónico.",
		}),

		// Forgot password
		forgotPassword: t({
			en: "Forgot password?",
			es: "¿Olvidaste tu contraseña?",
		}),

		// Remember me
		rememberMe: t({
			en: "Keep me signed in",
			es: "Mantenerme conectado",
		}),

		// Email selection (GitHub OAuth with multiple verified emails)
		selectEmailTitle: t({
			en: "Select Your Email Address",
			es: "Selecciona tu Dirección de Correo Electrónico",
		}),
		selectEmailSubtitle: t({
			en: "GitHub returned multiple verified email addresses. Please select which one to use for your Jolli account:",
			es: "GitHub devolvió múltiples direcciones de correo electrónico verificadas. Por favor, selecciona cuál usar para tu cuenta de Jolli:",
		}),
		primaryBadge: t({
			en: "Primary",
			es: "Principal",
		}),
		submitting: t({
			en: "Confirming...",
			es: "Confirmando...",
		}),
		continue: t({
			en: "Continue",
			es: "Continuar",
		}),
	},
} satisfies Dictionary;

export default authContent;
