import { type Dictionary, t } from "intlayer";

/**
 * Localization content for authentication UI
 */
const authContent = {
	key: "auth",
	content: {
		// Email selection
		selectEmailTitle: t({
			en: "Select Email",
			es: "Seleccionar correo electrónico",
		}),
		selectEmailPrompt: t({
			en: "Choose which email to use for your account:",
			es: "Elige qué correo electrónico usar para tu cuenta:",
		}),

		// Error messages
		selectEmailError: t({
			en: "Failed to select email. Please try again.",
			es: "Error al seleccionar el correo electrónico. Por favor, inténtalo de nuevo.",
		}),
		loginError: t({
			en: "Login failed. Please try again.",
			es: "Error al iniciar sesión. Por favor, inténtalo de nuevo.",
		}),
	},
} satisfies Dictionary;

export default authContent;
