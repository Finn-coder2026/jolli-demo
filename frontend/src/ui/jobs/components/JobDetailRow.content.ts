import { type Dictionary, insert, t } from "intlayer";

/**
 * Localization content for job detail UI elements.
 * Used in JobDetailRow component for tabs, labels, buttons, and messages.
 */
const jobDetailContent = {
	key: "job-detail",
	content: {
		// Tab labels
		tabs: {
			overview: t({
				en: "Overview",
				es: "Resumen",
			}),
			params: t({
				en: "Params",
				es: "Parámetros",
			}),
			logs: t({
				en: "Logs",
				es: "Registros",
			}),
			errors: t({
				en: "Errors",
				es: "Errores",
			}),
			metadata: t({
				en: "Metadata",
				es: "Metadatos",
			}),
		},

		// Field labels in Overview tab
		fields: {
			status: t({
				en: "Status",
				es: "Estado",
			}),
			duration: t({
				en: "Duration",
				es: "Duración",
			}),
			startedAt: t({
				en: "Started At",
				es: "Iniciado en",
			}),
			completedAt: t({
				en: "Completed At",
				es: "Completado en",
			}),
			retryCount: t({
				en: "Retry Count",
				es: "Intentos de reintento",
			}),
			jobId: t({
				en: "Job ID",
				es: "ID de trabajo",
			}),
			createdAt: t({
				en: "Created At",
				es: "Creado en",
			}),
		},

		// Buttons
		buttons: {
			cancelJob: t({
				en: "Cancel Job",
				es: "Cancelar trabajo",
			}),
			retryJob: t({
				en: "Retry Job",
				es: "Reintentar trabajo",
			}),
		},

		// Messages
		messages: {
			noLogsAvailable: t({
				en: "No logs available",
				es: "No hay registros disponibles",
			}),
			noErrors: t({
				en: "No errors",
				es: "No hay errores",
			}),
			retries: t({
				en: insert("{{count}} retries"),
				es: insert("{{count}} reintentos"),
			}),
			retry: t({
				en: insert("{{count}} retry"),
				es: insert("{{count}} reintento"),
			}),
		},

		// Error section headings
		errors: {
			errorMessage: t({
				en: "Error Message",
				es: "Mensaje de error",
			}),
			stackTrace: t({
				en: "Stack Trace",
				es: "Seguimiento de pila",
			}),
		},
	},
} satisfies Dictionary;

export default jobDetailContent;
