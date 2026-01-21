import { type Dictionary, insert, t } from "intlayer";

const gitHubRepositoryItemContent = {
	key: "github-repo-item",
	content: {
		failedToggle: t({ en: "Failed to toggle repository", es: "Error al cambiar estado del repositorio" }),
		statusLabels: {
			needsAttention: t({ en: "Needs Attention", es: "Requiere Atención" }),
			error: t({ en: "Error", es: "Error" }),
			enabled: t({ en: "Enabled", es: "Habilitado" }),
			available: t({ en: "Available", es: "Disponible" }),
		},
		accessErrors: {
			repoNotAccessibleByApp: t({
				en: "Repository is not accessible by the GitHub App",
				es: "El repositorio no es accesible por la aplicación de GitHub",
			}),
			repoRemovedFromInstallation: t({
				en: "Repository was removed from GitHub App installation",
				es: "El repositorio fue eliminado de la instalación de la aplicación de GitHub",
			}),
			appInstallationUninstalled: t({
				en: "GitHub App installation was uninstalled",
				es: "La instalación de la aplicación de GitHub fue desinstalada",
			}),
			repoNotAccessibleViaInstallation: t({
				en: "Repository is not accessible via GitHub App installation",
				es: "El repositorio no es accesible a través de la instalación de la aplicación de GitHub",
			}),
		},
		lastChecked: t({
			en: insert("Last checked: {{date}}"),
			es: insert("Última revisión: {{date}}"),
		}),
		notAccessible: {
			title: t({ en: "Repository not accessible", es: "Repositorio no accesible" }),
			message: t({
				en: "This repository is no longer included in your GitHub App installation. To restore access:",
				es: "Este repositorio ya no está incluido en su instalación de la aplicación de GitHub. Para restaurar el acceso:",
			}),
			step1: t({
				en: 'Click "Manage installation on GitHub" above',
				es: 'Haga clic en "Gestionar instalación en GitHub" arriba',
			}),
			step2: t({
				en: "Add this repository to the installation",
				es: "Agregue este repositorio a la instalación",
			}),
			step3: t({
				en: 'Return here and click "Sync" to refresh',
				es: 'Regrese aquí y haga clic en "Sincronizar" para actualizar',
			}),
		},
	},
} satisfies Dictionary;

export default gitHubRepositoryItemContent;
