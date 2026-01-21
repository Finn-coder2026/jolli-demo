import { type Dictionary, t } from "intlayer";

/**
 * Localization content for Article detail view
 */
const articleContent = {
	key: "article",
	content: {
		// Status badges and descriptions
		statusUpToDate: t({
			en: "Up to Date",
			es: "Actualizado",
		}),
		statusUpToDateTitle: t({
			en: "Article is Up to Date",
			es: "El artículo está actualizado",
		}),
		statusUpToDateDesc: t({
			en: "No changes needed. This article is current with the latest codebase.",
			es: "No se necesitan cambios. Este artículo está actualizado con la última versión del código.",
		}),
		statusNeedsUpdate: t({
			en: "Needs Update",
			es: "Necesita actualización",
		}),
		statusNeedsUpdateTitle: t({
			en: "Article Needs Update",
			es: "El artículo necesita actualización",
		}),
		statusNeedsUpdateDesc: t({
			en: "Changes detected in the codebase. This article should be reviewed and updated.",
			es: "Se detectaron cambios en el código. Este artículo debe ser revisado y actualizado.",
		}),
		statusUnderReview: t({
			en: "Under Review",
			es: "En revisión",
		}),
		statusUnderReviewTitle: t({
			en: "Article Under Review",
			es: "Artículo en revisión",
		}),
		statusUnderReviewDesc: t({
			en: "This article is currently being reviewed for accuracy and completeness.",
			es: "Este artículo está siendo revisado para verificar su precisión e integridad.",
		}),
		statusUnknown: t({
			en: "Unknown",
			es: "Desconocido",
		}),
		statusUnknownTitle: t({
			en: "Unknown Status",
			es: "Estado desconocido",
		}),
		statusUnknownDesc: t({
			en: "Status information not available.",
			es: "Información de estado no disponible.",
		}),

		// Loading and error states
		loading: t({
			en: "Loading article...",
			es: "Cargando artículo...",
		}),
		notFound: t({
			en: "Article not found",
			es: "Artículo no encontrado",
		}),

		// Action buttons
		backToArticles: t({
			en: "Back to Articles",
			es: "Volver a artículos",
		}),
		viewArticle: t({
			en: "View Article",
			es: "Ver artículo",
		}),
		viewOriginal: t({
			en: "View Original",
			es: "Ver original",
		}),
		editButton: t({
			en: "Edit",
			es: "Editar",
		}),

		// Metadata labels
		untitled: t({
			en: "Untitled",
			es: "Sin título",
		}),
		unknownSource: t({
			en: "Unknown Source",
			es: "Fuente desconocida",
		}),
		unknown: t({
			en: "Unknown",
			es: "Desconocido",
		}),
		lastUpdated: t({
			en: "Last updated",
			es: "Última actualización",
		}),
		qualityScoreLabel: t({
			en: "Quality Score:",
			es: "Puntuación de calidad:",
		}),

		// Quality Assessment section
		qualityAssessmentTitle: t({
			en: "Quality Assessment",
			es: "Evaluación de calidad",
		}),
		qualityAccurate: t({
			en: "Content is accurate and up-to-date",
			es: "El contenido es preciso y está actualizado",
		}),
		qualityExamplesVerified: t({
			en: "All code examples are verified",
			es: "Todos los ejemplos de código están verificados",
		}),
		qualityNoChanges: t({
			en: "No related code changes detected",
			es: "No se detectaron cambios de código relacionados",
		}),
		qualityPositiveFeedback: t({
			en: "Positive customer feedback",
			es: "Retroalimentación positiva de clientes",
		}),

		// View toggle
		articleContentTitle: t({
			en: "Article Content",
			es: "Contenido del artículo",
		}),
		rendered: t({
			en: "Rendered",
			es: "Renderizado",
		}),
		sourceCode: t({
			en: "Source",
			es: "Código fuente",
		}),

		// Recent Activity section
		recentActivityTitle: t({
			en: "Recent Activity",
			es: "Actividad reciente",
		}),
		recentActivityDesc: t({
			en: "Recent reviews and verifications",
			es: "Revisiones y verificaciones recientes",
		}),
		recentCodeReview: t({
			en: "Recent code review",
			es: "Revisión de código reciente",
		}),
		lowImpact: t({
			en: "Low Impact",
			es: "Impacto bajo",
		}),
		reviewedDesc: t({
			en: "Article was reviewed and verified to be accurate with current codebase",
			es: "El artículo fue revisado y verificado para estar preciso con el código actual",
		}),
		byDocTeam: t({
			en: "by Documentation Team • 1 week ago",
			es: "por el equipo de documentación • hace 1 semana",
		}),
		customerFeedbackAnalysis: t({
			en: "Customer feedback analysis",
			es: "Análisis de retroalimentación de clientes",
		}),
		feedbackAnalysisDesc: t({
			en: "Analyzed 50+ customer interactions. No common issues or confusion points identified.",
			es: "Se analizaron más de 50 interacciones de clientes. No se identificaron problemas comunes o puntos de confusión.",
		}),
		bySupportTeam: t({
			en: "by Support Team • 2 weeks ago",
			es: "por el equipo de soporte • hace 2 semanas",
		}),

		// Article Info sidebar
		articleInfoTitle: t({
			en: "Article Info",
			es: "Información del artículo",
		}),
		sourceLabel: t({
			en: "Source",
			es: "Fuente",
		}),
		statusLabel: t({
			en: "Status",
			es: "Estado",
		}),
		qualityScoreInfoLabel: t({
			en: "Quality Score",
			es: "Puntuación de calidad",
		}),
		contentTypeLabel: t({
			en: "Content Type",
			es: "Tipo de contenido",
		}),

		// Update Instruction fields
		updateInstruction: t({
			en: "Update Instruction",
			es: "Instrucción de actualización",
		}),
		updateInstructionPlaceholder: t({
			en: "Enter update instructions for JolliScript",
			es: "Ingrese instrucciones de actualización para JolliScript",
		}),
		save: t({
			en: "Save",
			es: "Guardar",
		}),
		saving: t({
			en: "Saving...",
			es: "Guardando...",
		}),

		// Update Doc button
		updateDoc: t({
			en: "Update Doc",
			es: "Actualizar documento",
		}),
		updatingDoc: t({
			en: "Updating...",
			es: "Actualizando...",
		}),

		// Source doc and permissions
		sourceDocBadge: t({ en: "Source", es: "Fuente" }),
		permissionsLabel: t({ en: "Permissions", es: "Permisos" }),
		permissionRead: t({ en: "Read", es: "Lectura" }),
		permissionWrite: t({ en: "Write", es: "Escritura" }),
		permissionExecute: t({ en: "Execute", es: "Ejecutar" }),
		sourceDocReadOnly: t({
			en: "Source documents are read-only",
			es: "Los documentos fuente son de solo lectura",
		}),
	},
} satisfies Dictionary;

export default articleContent;
