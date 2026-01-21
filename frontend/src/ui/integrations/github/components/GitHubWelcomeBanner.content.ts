import { type Dictionary, t } from "intlayer";

const GitHubWelcomeBannerContent = {
	key: "github-welcome-banner",
	content: {
		title: t({ en: "GitHub App Installed Successfully!", es: "¡Aplicación de GitHub Instalada Exitosamente!" }),
		messageSingular: t({
			en: "To get started, enable the repository below so Jolli can start generating documentation for your code.",
			es: "Para comenzar, habilite el repositorio a continuación para que Jolli pueda comenzar a generar documentación para su código.",
		}),
		messagePlural: t({
			en: "To get started, enable one or more repositories below so Jolli can start generating documentation for your code.",
			es: "Para comenzar, habilite uno o más repositorios a continuación para que Jolli pueda comenzar a generar documentación para su código.",
		}),
		dismiss: t({ en: "Dismiss", es: "Cerrar" }),
	},
} satisfies Dictionary;

export default GitHubWelcomeBannerContent;
