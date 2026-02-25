import { type Dictionary, t } from "intlayer";

const GitHubIntegrationFlowContent = {
	key: "github-integration-flow",
	content: {
		loading: t({ en: "Checking for available installations...", es: "Buscando instalaciones disponibles..." }),
		selectInstallation: t({ en: "Connect GitHub Installation", es: "Conectar instalación de GitHub" }),
		selectInstallationDesc: t({
			en: "Select an existing GitHub App installation to connect, or install on a new organization.",
			es: "Selecciona una instalación existente de la aplicación de GitHub para conectar, o instala en una nueva organización.",
		}),
		organization: t({ en: "Organization", es: "Organización" }),
		user: t({ en: "User", es: "Usuario" }),
		repositories: t({ en: "repositories", es: "repositorios" }),
		connect: t({ en: "Connect", es: "Conectar" }),
		installNewOrganization: t({
			en: "Install on new organization",
			es: "Instalar en nueva organización",
		}),
		connecting: t({ en: "Connecting installation...", es: "Conectando instalación..." }),
		redirecting: t({ en: "Redirecting to GitHub...", es: "Redirigiendo a GitHub..." }),
		failedInstallationUrl: t({
			en: "Failed to get installation URL",
			es: "Error al obtener URL de instalación",
		}),
		failedSetup: t({
			en: "Failed to setup GitHub integration",
			es: "Error al configurar integración de GitHub",
		}),
		installationNotAvailable: t({
			en: "This GitHub organization is already linked to another Jolli workspace.",
			es: "Esta organización de GitHub ya está vinculada a otro espacio de trabajo de Jolli.",
		}),
		waitingForInstall: t({
			en: "Completing GitHub App installation...",
			es: "Completando la instalación de la aplicación de GitHub...",
		}),
		waitingForInstallHint: t({
			en: "Complete the installation in the new browser window. This dialog will update automatically.",
			es: "Completa la instalación en la nueva ventana del navegador. Este diálogo se actualizará automáticamente.",
		}),
		goBack: t({ en: "Go Back", es: "Volver" }),
	},
} satisfies Dictionary;

export default GitHubIntegrationFlowContent;
