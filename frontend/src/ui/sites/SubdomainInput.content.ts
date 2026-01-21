import { type Dictionary, t } from "intlayer";

const subdomainInputContent = {
	key: "subdomain-input",
	content: {
		label: t({
			en: "Subdomain",
			es: "Subdominio",
		}),
		placeholder: t({
			en: "my-docs",
			es: "mis-docs",
		}),
		help: t({
			en: "Your site will be available at this address. Letters, numbers, and hyphens only.",
			es: "Tu sitio estará disponible en esta dirección. Solo letras, números y guiones.",
		}),
		checking: t({
			en: "Checking availability...",
			es: "Verificando disponibilidad...",
		}),
		available: t({
			en: "This subdomain is available!",
			es: "¡Este subdominio está disponible!",
		}),
		taken: t({
			en: "This subdomain is already taken.",
			es: "Este subdominio ya está en uso.",
		}),
		trySuggestion: t({
			en: "Try this instead",
			es: "Prueba este en su lugar",
		}),
		checkFailed: t({
			en: "Failed to check availability. Please try again.",
			es: "Error al verificar disponibilidad. Intenta de nuevo.",
		}),
		tooShort: t({
			en: "Subdomain must be at least 3 characters.",
			es: "El subdominio debe tener al menos 3 caracteres.",
		}),
		tooLong: t({
			en: "Subdomain must be 63 characters or less.",
			es: "El subdominio debe tener 63 caracteres o menos.",
		}),
		invalidFormat: t({
			en: "Subdomain can only contain letters, numbers, and hyphens. Cannot start or end with a hyphen.",
			es: "El subdominio solo puede contener letras, números y guiones. No puede comenzar o terminar con un guión.",
		}),
		invalidCharacters: t({
			en: "Only lowercase letters, numbers, and hyphens are allowed.",
			es: "Solo se permiten letras minúsculas, números y guiones.",
		}),
		consecutiveHyphens: t({
			en: "Consecutive hyphens are not allowed.",
			es: "No se permiten guiones consecutivos.",
		}),
	},
} satisfies Dictionary;

export default subdomainInputContent;
