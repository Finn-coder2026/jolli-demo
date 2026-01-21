import { type Dictionary, t } from "intlayer";

const jobHistoryContent = {
	key: "job-history",
	content: {
		loading: t({ en: "Loading job history...", es: "Cargando historial de trabajos..." }),
		dashboard: t({ en: "Dashboard", es: "Panel de Control" }),
		title: t({ en: "Job History", es: "Historial de Trabajos" }),
		subtitle: t({
			en: "View past job executions and their details",
			es: "Ver ejecuciones de trabajos pasadas y sus detalles",
		}),
		statusFilters: {
			all: t({ en: "All Statuses", es: "Todos los Estados" }),
			completed: t({ en: "Completed", es: "Completado" }),
			failed: t({ en: "Failed", es: "Fallido" }),
			cancelled: t({ en: "Cancelled", es: "Cancelado" }),
			active: t({ en: "Active", es: "Activo" }),
			queued: t({ en: "Queued", es: "En Cola" }),
		},
		refresh: t({ en: "Refresh", es: "Actualizar" }),
		noJobs: t({ en: "No jobs found", es: "No se encontraron trabajos" }),
		error: t({ en: "Failed to load job history", es: "Error al cargar historial de trabajos" }),
	},
} satisfies Dictionary;

export default jobHistoryContent;
