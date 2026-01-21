import { type Dictionary, t } from "intlayer";

const staticFileManageContent = {
	key: "static-file-manage",
	content: {
		loading: t({ en: "Loading...", es: "Cargando..." }),
		errorLoading: t({ en: "Failed to load integration", es: "Error al cargar la integración" }),
		notFound: t({ en: "Integration not found", es: "Integración no encontrada" }),
		backToIntegrations: t({ en: "Back to Sources", es: "Volver a Fuentes" }),
		subtitle: t({ en: "Upload files to this source", es: "Sube archivos a esta fuente" }),
		uploadTitle: t({ en: "Upload a File", es: "Subir un Archivo" }),
		dropzoneText: t({
			en: "Click to select a file or drag and drop",
			es: "Haz clic para seleccionar un archivo o arrastra y suelta",
		}),
		fileRequired: t({ en: "Please select a file to upload", es: "Por favor selecciona un archivo para subir" }),
		uploading: t({ en: "Uploading...", es: "Subiendo..." }),
		failedUpload: t({ en: "Failed to upload file", es: "Error al subir el archivo" }),
		uploadSuccess: t({ en: "File uploaded successfully!", es: "¡Archivo subido exitosamente!" }),
	},
} satisfies Dictionary;

export default staticFileManageContent;
