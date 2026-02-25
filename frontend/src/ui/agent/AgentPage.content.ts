import type { Dictionary } from "intlayer";
import { t } from "intlayer";

const agentPageContent = {
	key: "agent-page",
	content: {
		newChat: t({
			en: "New Chat",
			es: "Nuevo Chat",
		}),
		welcomeTitle: t({
			en: "What can I help with?",
			es: "¿En qué puedo ayudarte?",
		}),
		inputPlaceholder: t({
			en: "Message Jolli Agent...",
			es: "Mensaje al Agente Jolli...",
		}),
		send: t({
			en: "Send",
			es: "Enviar",
		}),
		stop: t({
			en: "Stop",
			es: "Detener",
		}),
		copy: t({
			en: "Copy",
			es: "Copiar",
		}),
		copied: t({
			en: "Copied!",
			es: "¡Copiado!",
		}),
		createArticle: t({
			en: "Create article",
			es: "Crear artículo",
		}),
		tryAgain: t({
			en: "Try again",
			es: "Intentar de nuevo",
		}),
		deleteConvo: t({
			en: "Delete",
			es: "Eliminar",
		}),
		renameConvo: t({
			en: "Rename",
			es: "Renombrar",
		}),
		untitledConvo: t({
			en: "Untitled conversation",
			es: "Conversación sin título",
		}),
		today: t({
			en: "Today",
			es: "Hoy",
		}),
		yesterday: t({
			en: "Yesterday",
			es: "Ayer",
		}),
		thisWeek: t({
			en: "This Week",
			es: "Esta Semana",
		}),
		thisMonth: t({
			en: "This Month",
			es: "Este Mes",
		}),
		older: t({
			en: "Older",
			es: "Más Antiguo",
		}),
		suggestionDraft: t({
			en: "Draft an article",
			es: "Redactar un artículo",
		}),
		suggestionDraftDesc: t({
			en: "Write documentation from scratch",
			es: "Escribir documentación desde cero",
		}),
		suggestionSearch: t({
			en: "Search knowledge",
			es: "Buscar conocimiento",
		}),
		suggestionSearchDesc: t({
			en: "Find information across your spaces",
			es: "Encontrar información en tus espacios",
		}),
		suggestionSummarize: t({
			en: "Summarize content",
			es: "Resumir contenido",
		}),
		suggestionSummarizeDesc: t({
			en: "Get concise summaries of articles",
			es: "Obtener resúmenes concisos de artículos",
		}),
		suggestionAnswer: t({
			en: "Answer a question",
			es: "Responder una pregunta",
		}),
		suggestionAnswerDesc: t({
			en: "Get answers from your knowledge base",
			es: "Obtener respuestas de tu base de conocimiento",
		}),
		scrollToBottom: t({
			en: "Scroll to bottom",
			es: "Desplazar al final",
		}),
		conversations: t({
			en: "Conversations",
			es: "Conversaciones",
		}),
		errorSending: t({
			en: "Failed to send message. Please try again.",
			es: "Error al enviar el mensaje. Inténtalo de nuevo.",
		}),
		agentPlan: t({
			en: "Agent Plan",
			es: "Plan del Agente",
		}),
		viewPlan: t({
			en: "View Plan",
			es: "Ver Plan",
		}),
		phasePlanning: t({
			en: "Planning",
			es: "Planificación",
		}),
		phaseExecuting: t({
			en: "Executing",
			es: "Ejecutando",
		}),
		phaseComplete: t({
			en: "Complete",
			es: "Completado",
		}),
		planEmpty: t({
			en: "The plan will appear here as the assistant gathers information.",
			es: "El plan aparecerá aquí a medida que el asistente recopile información.",
		}),
		collapsePlan: t({
			en: "Collapse plan",
			es: "Contraer plan",
		}),
		expandPlan: t({
			en: "Expand plan",
			es: "Expandir plan",
		}),
		maximizePlan: t({
			en: "View full plan",
			es: "Ver plan completo",
		}),
		modePlan: t({
			en: "Plan",
			es: "Plan",
		}),
		confirmAction: t({
			en: "Confirm action",
			es: "Confirmar acción",
		}),
		approve: t({
			en: "Approve",
			es: "Aprobar",
		}),
		deny: t({
			en: "Deny",
			es: "Rechazar",
		}),
		toolDenied: t({
			en: "Denied",
			es: "Rechazado",
		}),
		toolApproved: t({
			en: "Approved",
			es: "Aprobado",
		}),
	},
} satisfies Dictionary;

export default agentPageContent;
