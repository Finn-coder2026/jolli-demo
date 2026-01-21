import { type Dictionary, insert, t } from "intlayer";

const integrationsContent = {
	key: "integrations",
	content: {
		title: t({ en: "Sources", es: "Fuentes" }),
		subtitle: t({ en: "Connect with external services", es: "Conéctese con servicios externos" }),
		addIntegration: t({ en: "Add Source", es: "Agregar Fuente" }),
		loading: t({ en: "Loading sources...", es: "Cargando fuentes..." }),
		errorFallback: t({ en: "Failed to load source summary", es: "Error al cargar resumen de fuentes" }),
		noIntegrations: t({ en: "No sources connected yet", es: "Aún no hay fuentes conectadas" }),
		connectFirstRepo: t({ en: "Connect Your First Source", es: "Conecte Su Primera Fuente" }),
		githubTitle: t({ en: "GitHub", es: "GitHub" }),
		staticFilesTitle: t({ en: "Static Files", es: "Archivos Estáticos" }),
		staticFilesDescription: t({ en: "files uploaded", es: "archivos subidos" }),
		confirmDeleteIntegration: t({
			en: insert(
				"Are you sure you want to delete '{{name}}'? This will also delete all associated documents. This action cannot be undone.",
			),
			es: insert(
				"¿Estás seguro de que quieres eliminar '{{name}}'? Esto también eliminará todos los documentos asociados. Esta acción no se puede deshacer.",
			),
		}),
	},
} satisfies Dictionary;

export default integrationsContent;
