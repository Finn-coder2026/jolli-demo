import { type Dictionary, insert, t } from "intlayer";

const siteLogsTabContent = {
	key: "site-logs-tab",
	content: {
		buildInProgress: t({
			en: "Build in Progress",
			es: "Construcción en Progreso",
		}),
		waitingForBuild: t({
			en: "Waiting for build to start...",
			es: "Esperando que inicie la construcción...",
		}),
		buildComplete: t({
			en: "Build Complete",
			es: "Construcción Completada",
		}),
		buildFailed: t({
			en: "Build Failed",
			es: "Construcción Fallida",
		}),
		noBuildHistory: t({
			en: "No build history available",
			es: "No hay historial de construcción disponible",
		}),
		logStartingBuild: t({
			en: insert("Starting {{mode}} build..."),
			es: insert("Iniciando construcción {{mode}}..."),
		}),
		logBuildCompleted: t({
			en: "Build completed successfully!",
			es: "¡Construcción completada exitosamente!",
		}),
		logBuildFailed: t({
			en: insert("Build failed: {{error}}"),
			es: insert("Construcción fallida: {{error}}"),
		}),
		logDeploymentState: t({
			en: insert("Deployment state: {{state}}"),
			es: insert("Estado de despliegue: {{state}}"),
		}),
		connected: t({
			en: "Live",
			es: "En Vivo",
		}),
	},
} satisfies Dictionary;

export default siteLogsTabContent;
