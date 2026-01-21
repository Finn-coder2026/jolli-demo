import { type Dictionary, t } from "intlayer";

const staticFileIntegrationFlowContent = {
	key: "static-file-integration-flow",
	content: {
		title: t({ en: "Create Static File Source", es: "Crear Fuente de Archivo Estático" }),
		description: t({
			en: "Upload documents directly to Jolli for AI-powered documentation.",
			es: "Sube documentos directamente a Jolli para documentación impulsada por IA.",
		}),
		nameLabel: t({ en: "Source Name", es: "Nombre de la Fuente" }),
		namePlaceholder: t({ en: "e.g., Product Documentation", es: "ej., Documentación del Producto" }),
		nameRequired: t({
			en: "Please enter a name for this source",
			es: "Por favor ingrese un nombre para esta fuente",
		}),
		continue: t({ en: "Continue", es: "Continuar" }),
		cancel: t({ en: "Cancel", es: "Cancelar" }),
		failedCreate: t({ en: "Failed to create source", es: "Error al crear la fuente" }),

		uploadTitle: t({ en: "Upload Your First File", es: "Sube Tu Primer Archivo" }),
		uploadDescription: t({
			en: "Upload a markdown, text, JSON, or YAML file to get started.",
			es: "Sube un archivo markdown, texto, JSON o YAML para comenzar.",
		}),
		dropzoneText: t({
			en: "Click to select a file or drag and drop",
			es: "Haz clic para seleccionar un archivo o arrastra y suelta",
		}),
		fileRequired: t({ en: "Please select a file to upload", es: "Por favor selecciona un archivo para subir" }),
		uploading: t({ en: "Uploading...", es: "Subiendo..." }),
		skipForNow: t({ en: "Skip for now", es: "Omitir por ahora" }),
		failedUpload: t({ en: "Failed to upload file", es: "Error al subir el archivo" }),

		successTitle: t({ en: "Source Created!", es: "¡Fuente Creada!" }),
		successMessage: t({
			en: "Your static file source has been created. You can upload more files at any time.",
			es: "Tu fuente de archivo estático ha sido creada. Puedes subir más archivos en cualquier momento.",
		}),
		done: t({ en: "Done", es: "Listo" }),
	},
} satisfies Dictionary;

export default staticFileIntegrationFlowContent;
