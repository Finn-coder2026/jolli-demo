import { type Dictionary, t } from "intlayer";

const settingsContent = {
	key: "settings",
	content: {
		title: t({ en: "Account Settings", es: "Configuracion de cuenta" }),
		subtitle: t({
			en: "Configure your application preferences",
			es: "Configure las preferencias de su aplicacion",
		}),

		// Tab labels
		preferencesTab: t({ en: "Preferences", es: "Preferencias" }),
		rolesTab: t({ en: "Roles", es: "Roles" }),

		// Appearance section
		appearanceTitle: t({ en: "Appearance", es: "Apariencia" }),
		appearanceDescription: t({
			en: "Customize the look and feel of the application",
			es: "Personalice la apariencia de la aplicacion",
		}),
		themeLabel: t({ en: "Theme", es: "Tema" }),
		themeDescription: t({
			en: "Choose between light and dark mode",
			es: "Elija entre modo claro y oscuro",
		}),
		themeLight: t({ en: "Light", es: "Claro" }),
		themeDark: t({ en: "Dark", es: "Oscuro" }),
		languageTitle: t({ en: "Language", es: "Idioma" }),
		languageDescription: t({
			en: "Choose your preferred language",
			es: "Elija su idioma preferido",
		}),

		// Interface section
		interfaceTitle: t({ en: "Interface", es: "Interfaz" }),
		interfaceDescription: t({
			en: "Adjust interface layout and behavior",
			es: "Ajuste el diseno y comportamiento de la interfaz",
		}),
		sidebarLabel: t({ en: "Sidebar default state", es: "Estado predeterminado de la barra lateral" }),
		sidebarDescription: t({
			en: "Choose whether the sidebar starts expanded or collapsed",
			es: "Elija si la barra lateral inicia expandida o colapsada",
		}),
		sidebarExpanded: t({ en: "Expanded", es: "Expandida" }),
		sidebarCollapsed: t({ en: "Collapsed", es: "Colapsada" }),
		chatWidthLabel: t({ en: "Chat panel width", es: "Ancho del panel de chat" }),
		chatWidthDescription: t({
			en: "Set the default width of the chat panel (300-800 pixels)",
			es: "Establezca el ancho predeterminado del panel de chat (300-800 pixeles)",
		}),

		// Articles section
		articlesTitle: t({ en: "Articles", es: "Articulos" }),
		articlesDescription: t({
			en: "Configure article-related preferences",
			es: "Configure preferencias relacionadas con articulos",
		}),
		draftFilterLabel: t({ en: "Default draft filter", es: "Filtro de borradores predeterminado" }),
		draftFilterDescription: t({
			en: "Choose which drafts to show by default",
			es: "Elija que borradores mostrar de forma predeterminada",
		}),
		draftFilterAll: t({ en: "All", es: "Todos" }),
		draftFilterMyNew: t({ en: "My New Drafts", es: "Mis nuevos borradores" }),
		draftFilterShared: t({ en: "Shared With Me", es: "Compartidos conmigo" }),
		draftFilterSuggested: t({ en: "Suggested Updates", es: "Actualizaciones sugeridas" }),
		showToolDetailsLabel: t({ en: "Show AI tool details", es: "Mostrar detalles de herramientas de IA" }),
		showToolDetailsDescription: t({
			en: "Display detailed information about AI tool usage in article drafts",
			es: "Mostrar informacion detallada sobre el uso de herramientas de IA en borradores",
		}),

		// Advanced section
		advancedTitle: t({ en: "Advanced", es: "Avanzado" }),
		advancedDescription: t({
			en: "Advanced features and developer options",
			es: "Funciones avanzadas y opciones para desarrolladores",
		}),
		sourceViewLabel: t({ en: "Source view", es: "Vista de codigo" }),
		sourceViewDescription: t({
			en: "View raw source data for debugging",
			es: "Ver datos sin procesar para depuracion",
		}),
		viewSource: t({ en: "View Source", es: "Ver codigo" }),
	},
} satisfies Dictionary;

export default settingsContent;
