import { type Dictionary, t } from "intlayer";

const siteLogsTabContent = {
	key: "site-logs-tab",
	content: {
		title: t({
			en: "Build Logs",
			es: "Registros de Construcción",
		}),
		description: t({
			en: "View build history and deployment logs",
			es: "Ver historial de construcción y registros de despliegue",
		}),
		// Current build
		currentBuild: t({
			en: "Current Build",
			es: "Construcción Actual",
		}),
		buildInProgress: t({
			en: "Build in Progress",
			es: "Construcción en Progreso",
		}),
		waitingForBuild: t({
			en: "Waiting for build to start...",
			es: "Esperando que inicie la construcción...",
		}),
		// Build status
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
		// Log viewer
		showFullLogs: t({
			en: "Show Full Logs",
			es: "Mostrar Registros Completos",
		}),
		hideLogs: t({
			en: "Hide Logs",
			es: "Ocultar Registros",
		}),
		expandLogs: t({
			en: "Expand",
			es: "Expandir",
		}),
		collapseLogs: t({
			en: "Collapse",
			es: "Colapsar",
		}),
		// Build summary
		buildSummary: t({
			en: "Build Summary",
			es: "Resumen de Construcción",
		}),
		step: t({
			en: "Step",
			es: "Paso",
		}),
		duration: t({
			en: "Duration",
			es: "Duración",
		}),
		// Errors
		buildErrors: t({
			en: "Build Errors",
			es: "Errores de Construcción",
		}),
		lastBuildError: t({
			en: "Last Build Error",
			es: "Último Error de Construcción",
		}),
		noErrors: t({
			en: "No errors",
			es: "Sin errores",
		}),
		// Timestamps
		startedAt: t({
			en: "Started",
			es: "Iniciado",
		}),
		completedAt: t({
			en: "Completed",
			es: "Completado",
		}),
		// Connection status
		connected: t({
			en: "Live",
			es: "En Vivo",
		}),
		disconnected: t({
			en: "Disconnected",
			es: "Desconectado",
		}),
	},
} satisfies Dictionary;

export default siteLogsTabContent;
