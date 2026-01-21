import { type Dictionary, insert, t } from "intlayer";

/**
 * Miscellaneous localization content for smaller components
 */
const miscContent = {
	key: "misc",
	content: {
		// Dashboard
		progress: t({
			en: "Progress",
			es: "Progreso",
		}),

		// GitHub
		branch: t({
			en: insert("Branch: {{branch}}"),
			es: insert("Rama: {{branch}}"),
		}),

		repoBranch: t({
			en: insert("{{repo}} ({{branch}})"),
			es: insert("{{repo}} {{{branch}})"),
		}),

		// Breadcrumb accessibility
		breadcrumbAriaLabel: t({
			en: "Breadcrumb",
			es: "Ruta de navegación",
		}),

		// Job statistics labels
		statLabels: {
			itemsProcessed: t({
				en: "Items Processed",
				es: "Elementos procesados",
			}),
			filesProcessed: t({
				en: "Files Processed",
				es: "Archivos procesados",
			}),
			totalItems: t({
				en: "Total Items",
				es: "Total de elementos",
			}),
			totalFiles: t({
				en: "Total Files",
				es: "Total de archivos",
			}),
			completed: t({
				en: "Completed",
				es: "Completado",
			}),
			processed: t({
				en: "Processed",
				es: "Procesado",
			}),
			total: t({
				en: "Total",
				es: "Total",
			}),
			count: t({
				en: "Count",
				es: "Cantidad",
			}),
			items: t({
				en: "Items",
				es: "Elementos",
			}),
			files: t({
				en: "Files",
				es: "Archivos",
			}),
			phase: t({
				en: "Phase",
				es: "Fase",
			}),
			errors: t({
				en: "Errors",
				es: "Errores",
			}),
			warnings: t({
				en: "Warnings",
				es: "Advertencias",
			}),
			sandboxId: t({
				en: "Sandbox ID",
				es: "ID de Sandbox",
			}),
			githubUrl: t({
				en: "GitHub URL",
				es: "URL de GitHub",
			}),
			docJrn: t({
				en: "Document JRN",
				es: "JRN de documento",
			}),
		},

		// Common phase/status values (used in job stats)
		phases: {
			initializing: t({
				en: "Initializing",
				es: "Inicializando",
			}),
			"preparing-workflow": t({
				en: "Preparing workflow",
				es: "Preparando flujo de trabajo",
			}),
			"starting-sandbox": t({
				en: "Starting sandbox",
				es: "Iniciando sandbox",
			}),
			"sandbox-running": t({
				en: "Sandbox running",
				es: "Sandbox ejecutándose",
			}),
			"loading-data": t({
				en: "Loading data",
				es: "Cargando datos",
			}),
			"processing-batch-1": t({
				en: "Processing batch 1",
				es: "Procesando lote 1",
			}),
			"processing-batch-2": t({
				en: "Processing batch 2",
				es: "Procesando lote 2",
			}),
			"processing-batch-3": t({
				en: "Processing batch 3",
				es: "Procesando lote 3",
			}),
			finalizing: t({
				en: "Finalizing",
				es: "Finalizando",
			}),
			complete: t({
				en: "Complete",
				es: "Completado",
			}),
		},
	},
} satisfies Dictionary;

export default miscContent;
