import { type Dictionary, t } from "intlayer";

const repositoryEmptyStateContent = {
	key: "repository-empty-state",
	content: {
		noRepositoriesFound: t({ en: "No repositories found", es: "No se encontraron repositorios" }),
		noEnabledRepositories: t({ en: "No enabled repositories", es: "No hay repositorios habilitados" }),
		noAccess: t({
			en: "This installation doesn't have access to any repositories.",
			es: "Esta instalación no tiene acceso a ningún repositorio.",
		}),
		enableToStart: t({
			en: "Enable repositories to start generating documentation.",
			es: "Habilite repositorios para comenzar a generar documentación.",
		}),
		viewAll: t({ en: "View All Repositories", es: "Ver Todos los Repositorios" }),
	},
} satisfies Dictionary;

export default repositoryEmptyStateContent;
