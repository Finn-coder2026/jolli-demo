import { type Dictionary, t } from "intlayer";

/**
 * Localization content for session expiration dialog
 */
const sessionExpiredContent = {
	key: "session-expired",
	content: {
		title: t({
			en: "Session Expired",
			es: "Sesión Expirada",
		}),
		message: t({
			en: "Your session has expired due to inactivity. Please log in again to continue.",
			es: "Su sesión ha expirado debido a inactividad. Por favor, inicie sesión nuevamente para continuar.",
		}),
		loginButton: t({
			en: "Log In Again",
			es: "Iniciar Sesión Nuevamente",
		}),
	},
} satisfies Dictionary;

export default sessionExpiredContent;
