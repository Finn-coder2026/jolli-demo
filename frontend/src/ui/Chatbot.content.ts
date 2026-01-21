import { type Dictionary, t } from "intlayer";

const chatbotContent = {
	key: "chatbot",
	content: {
		conversation: t({
			en: "Conversation",
			es: "Conversación",
		}),
		newConversation: t({
			en: "New Conversation",
			es: "Nueva Conversación",
		}),
		conversations: t({
			en: "Conversations",
			es: "Conversaciones",
		}),
		close: t({
			en: "Close",
			es: "Cerrar",
		}),
		delete: t({
			en: "Delete",
			es: "Eliminar",
		}),
		noConversationsYet: t({
			en: "No conversations yet",
			es: "Aún no hay conversaciones",
		}),
		howCanIHelp: t({
			en: "How can I help you today?",
			es: "¿Cómo puedo ayudarte hoy?",
		}),
		messagePlaceholder: t({
			en: "Type your message... (Shift+Enter for new line)",
			es: "Escribe tu mensaje... (Shift+Enter para nueva línea)",
		}),
		sending: t({
			en: "Sending...",
			es: "Enviando...",
		}),
		send: t({
			en: "Send",
			es: "Enviar",
		}),
	},
} satisfies Dictionary;

export default chatbotContent;
