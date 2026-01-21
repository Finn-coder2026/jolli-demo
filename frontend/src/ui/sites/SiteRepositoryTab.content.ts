import { type Dictionary, t } from "intlayer";

const siteRepositoryTabContent = {
	key: "site-repository-tab",
	content: {
		title: t({
			en: "Repository & Content",
			es: "Repositorio y Contenido",
		}),
		noRepository: t({
			en: "No repository information available",
			es: "No hay información de repositorio disponible",
		}),
	},
} satisfies Dictionary;

export default siteRepositoryTabContent;
