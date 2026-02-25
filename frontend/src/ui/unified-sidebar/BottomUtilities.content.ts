import { type Dictionary, t } from "intlayer";

const bottomUtilitiesContent = {
	key: "bottom-utilities",
	content: {
		myProfile: t({
			en: "My Profile",
			es: "Mi Perfil",
		}),
		settings: t({
			en: "Settings",
			es: "Configuración",
		}),
		help: t({
			en: "Help & Documentation",
			es: "Ayuda y Documentación",
		}),
		devTools: t({
			en: "Dev Tools",
			es: "Herramientas de Desarrollo",
		}),
		signOut: t({
			en: "Log Out",
			es: "Cerrar Sesión",
		}),
		theme: t({
			en: "Theme",
			es: "Tema",
		}),
		systemTheme: t({
			en: "System theme",
			es: "Tema del sistema",
		}),
		lightMode: t({
			en: "Light mode",
			es: "Modo claro",
		}),
		darkMode: t({
			en: "Dark mode",
			es: "Modo oscuro",
		}),
		userContext: t({
			en: "User Context",
			es: "Contexto de Usuario",
		}),
		userContextDescription: t({
			en: "Current Agent Hub context state for debugging",
			es: "Estado actual del contexto del Agent Hub para depuración",
		}),
		contextActive: t({
			en: "Active",
			es: "Activo",
		}),
		contextConversationId: t({
			en: "Conversation ID",
			es: "ID de Conversación",
		}),
		contextNone: t({
			en: "none",
			es: "ninguno",
		}),
	},
} satisfies Dictionary;

export default bottomUtilitiesContent;
