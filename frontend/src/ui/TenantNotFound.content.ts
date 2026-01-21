import { type Dictionary, t } from "intlayer";

/**
 * Localization content for tenant not found page
 */
const tenantNotFoundContent = {
	key: "tenant-not-found",
	content: {
		// Page title
		title: t({
			en: "Page Not Found",
			es: "Página no encontrada",
		}),

		// Error messages based on error type
		notFoundMessage: t({
			en: "The workspace you're looking for doesn't exist or has been removed.",
			es: "El espacio de trabajo que buscas no existe o ha sido eliminado.",
		}),
		inactiveMessage: t({
			en: "This workspace is currently inactive. Please contact your administrator.",
			es: "Este espacio de trabajo está actualmente inactivo. Por favor, contacta a tu administrador.",
		}),
		genericMessage: t({
			en: "We couldn't find what you're looking for.",
			es: "No pudimos encontrar lo que buscas.",
		}),

		// Actions
		goToMain: t({
			en: "Go to main site",
			es: "Ir al sitio principal",
		}),
	},
} satisfies Dictionary;

export default tenantNotFoundContent;
