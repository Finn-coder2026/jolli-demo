import { type Dictionary, t } from "intlayer";

const GitHubOrgUserListContent = {
	key: "github-org-user-list",
	content: {
		breadcrumbs: {
			integrations: t({ en: "Sources", es: "Fuentes" }),
			github: t({ en: "GitHub", es: "GitHub" }),
		},
		title: t({ en: "GitHub Installations", es: "Instalaciones de GitHub" }),
		subtitle: t({
			en: "Select an organization or user to manage repository access",
			es: "Seleccione una organización o usuario para gestionar el acceso a repositorios",
		}),
		installing: t({ en: "Installing...", es: "Instalando..." }),
		installGitHubApp: t({ en: "Install GitHub App", es: "Instalar Aplicación de GitHub" }),
		loadingInstallations: t({ en: "Loading installations...", es: "Cargando instalaciones..." }),
		noInstallationsFound: t({
			en: "No GitHub installations found",
			es: "No se encontraron instalaciones de GitHub",
		}),
		installToGetStarted: t({
			en: "Install the GitHub App on your organization or user account to get started",
			es: "Instale la aplicación de GitHub en su organización o cuenta de usuario para comenzar",
		}),
		organizations: t({ en: "Organizations", es: "Organizaciones" }),
		users: t({ en: "Users", es: "Usuarios" }),
		needsAttention: t({ en: "Needs Attention", es: "Requiere Atención" }),
		repository: t({ en: "repository", es: "repositorio" }),
		repositories: t({ en: "repositories", es: "repositorios" }),
		failedLoadInstallations: t({
			en: "Failed to load GitHub installations",
			es: "Error al cargar instalaciones de GitHub",
		}),
		failedStartInstallation: t({ en: "Failed to start installation", es: "Error al iniciar instalación" }),
		failedRemoveInstallation: t({
			en: "Failed to remove installation",
			es: "Error al eliminar la instalación",
		}),
		removeButton: t({ en: "Remove from Jolli", es: "Eliminar de Jolli" }),
		removeModal: {
			titleOrg: t({ en: "Remove Organization", es: "Eliminar Organización" }),
			titleUser: t({ en: "Remove User", es: "Eliminar Usuario" }),
			warningMessage: t({
				en: "This will remove the installation and all associated repository integrations from Jolli. This action cannot be undone.",
				es: "Esto eliminará la instalación y todas las integraciones de repositorios asociadas de Jolli. Esta acción no se puede deshacer.",
			}),
			cancel: t({ en: "Cancel", es: "Cancelar" }),
			confirm: t({ en: "Remove", es: "Eliminar" }),
			removing: t({ en: "Removing...", es: "Eliminando..." }),
		},
		removeSuccess: {
			title: t({ en: "Installation Removed", es: "Instalación Eliminada" }),
			message: t({
				en: "was successfully removed from Jolli.",
				es: "fue eliminada correctamente de Jolli.",
			}),
			uninstallFromGitHub: t({
				en: "Uninstall from GitHub",
				es: "Desinstalar de GitHub",
			}),
		},
	},
} satisfies Dictionary;

export default GitHubOrgUserListContent;
