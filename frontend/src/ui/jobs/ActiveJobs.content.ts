import { type Dictionary, t } from "intlayer";

const activeJobsContent = {
	key: "active-jobs",
	content: {
		loading: t({ en: "Loading active jobs...", es: "Cargando trabajos activos..." }),
		dashboard: t({ en: "Dashboard", es: "Panel de Control" }),
		title: t({ en: "Active Jobs", es: "Trabajos Activos" }),
		subtitle: t({ en: "Currently running job executions", es: "Ejecuciones de trabajos en curso" }),
		refresh: t({ en: "Refresh", es: "Actualizar" }),
		noActiveJobs: t({ en: "No active jobs", es: "No hay trabajos activos" }),
		errors: {
			cancelJob: t({ en: "Failed to cancel job", es: "Error al cancelar el trabajo" }),
			loadJobs: t({ en: "Failed to load active jobs", es: "Error al cargar trabajos activos" }),
		},
	},
} satisfies Dictionary;

export default activeJobsContent;
