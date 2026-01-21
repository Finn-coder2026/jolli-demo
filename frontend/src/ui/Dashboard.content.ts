import { type Dictionary, t } from "intlayer";

const dashboardContent = {
	key: "dashboard",
	content: {
		title: t({
			en: "Dashboard",
			es: "Panel de Control",
		}),
		subtitle: t({
			en: "Overview of your system status and running jobs",
			es: "Resumen del estado del sistema y trabajos en ejecución",
		}),

		// JobsStatsCard
		jobsTitle: t({
			en: "Jobs",
			es: "Trabajos",
		}),
		loadingStats: t({
			en: "Loading stats...",
			es: "Cargando estadísticas...",
		}),
		noStats: t({
			en: "No stats available",
			es: "No hay estadísticas disponibles",
		}),
		statRunning: t({
			en: "Running",
			es: "Ejecutando",
		}),
		statCompleted: t({
			en: "Completed",
			es: "Completados",
		}),
		statFailed: t({
			en: "Failed",
			es: "Fallidos",
		}),
		statRetries: t({
			en: "Retries",
			es: "Reintentos",
		}),
		viewRunningJobs: t({
			en: "View Running Jobs",
			es: "Ver Trabajos en Ejecución",
		}),
		viewHistory: t({
			en: "View History",
			es: "Ver Historial",
		}),

		// JobRunningCard
		justStarted: t({
			en: "Just started",
			es: "Recién iniciado",
		}),
		view: t({
			en: "View",
			es: "Ver",
		}),
		pinJob: t({
			en: "Pin job",
			es: "Fijar trabajo",
		}),
		unpinJob: t({
			en: "Unpin job",
			es: "Desfijar trabajo",
		}),
		dismissJob: t({
			en: "Dismiss job",
			es: "Descartar trabajo",
		}),
	},
} satisfies Dictionary;

export default dashboardContent;
