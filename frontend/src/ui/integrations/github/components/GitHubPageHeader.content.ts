import { type Dictionary, insert, t } from "intlayer";

const GitHubPageHeaderContent = {
	key: "github-page-header",
	content: {
		organization: t({ en: "Organization", es: "Organización" }),
		user: t({ en: "User", es: "Usuario" }),
		repositoriesTitle: t({
			en: insert("{{name}} Repositories"),
			es: insert("Repositorios de {{name}}"),
		}),
		enableRepositories: t({
			en: "Enable repositories for Jolli to interact with",
			es: "Habilite repositorios para que Jolli pueda interactuar con ellos",
		}),
		manageInstallation: t({
			en: "Manage installation on GitHub",
			es: "Gestionar instalación en GitHub",
		}),
		removeFromJolli: t({
			en: "Remove from Jolli",
			es: "Eliminar de Jolli",
		}),
		sync: t({ en: "Sync", es: "Sincronizar" }),
	},
} satisfies Dictionary;

export default GitHubPageHeaderContent;
