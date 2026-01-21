import { type Dictionary, t } from "intlayer";

const githubRepoListContent = {
	key: "github-repo-list",
	content: {
		loading: t({ en: "Loading...", es: "Cargando..." }),
		searchPlaceholder: t({ en: "Search repositories...", es: "Buscar repositorios..." }),
		// UninstalledAppWarning
		uninstalledWarning: {
			title: t({ en: "GitHub App Not Installed", es: "Aplicación de GitHub No Instalada" }),
			messageOrg: t({
				en: "The GitHub App is no longer installed on this organization. To restore access to repositories, you'll need to reinstall the app.",
				es: "La aplicación de GitHub ya no está instalada en esta organización. Para restaurar el acceso a los repositorios, deberá reinstalar la aplicación.",
			}),
			messageUser: t({
				en: "The GitHub App is no longer installed on this user account. To restore access to repositories, you'll need to reinstall the app.",
				es: "La aplicación de GitHub ya no está instalada en esta cuenta de usuario. Para restaurar el acceso a los repositorios, deberá reinstalar la aplicación.",
			}),
			reinstallOnGitHub: t({ en: "Reinstall on GitHub", es: "Reinstalar en GitHub" }),
			viewInstallations: t({ en: "View Installations on GitHub", es: "Ver Instalaciones en GitHub" }),
			deleteFromJolli: t({ en: "Delete from Jolli", es: "Eliminar de Jolli" }),
		},
		// DeleteContainerModal
		deleteModal: {
			titleOrg: t({ en: "Delete Organization", es: "Eliminar Organización" }),
			titleUser: t({ en: "Delete User", es: "Eliminar Usuario" }),
			confirmMessage: t({
				en: "Are you sure you want to delete {name} from Jolli?",
				es: "¿Está seguro de que desea eliminar {name} de Jolli?",
			}),
			warningMessage: t({
				en: "This will remove all associated repository integrations from Jolli. This action cannot be undone.",
				es: "Esto eliminará todas las integraciones de repositorio asociadas de Jolli. Esta acción no se puede deshacer.",
			}),
			cancel: t({ en: "Cancel", es: "Cancelar" }),
			deleting: t({ en: "Deleting...", es: "Eliminando..." }),
			deleteButton: t({ en: "Delete from Jolli", es: "Eliminar de Jolli" }),
		},
	},
} satisfies Dictionary;

export default githubRepoListContent;
