import { type Dictionary, t } from "intlayer";

const siteBrandingTabContent = {
	key: "site-branding-tab",
	content: {
		// Section header
		brandingTitle: t({ en: "Branding", es: "Marca" }),
		brandingDescription: t({
			en: "Customize your site's visual appearance — theme, colors, logo, and layout.",
			es: "Personaliza la apariencia visual de tu sitio — tema, colores, logo y diseño.",
		}),

		// Logo section
		logoTextLabel: t({ en: "Logo Text", es: "Texto del Logo" }),
		logoUrlLabel: t({ en: "Logo URL", es: "URL del Logo" }),
		logoUrlHint: t({
			en: "PNG, SVG, or WebP. Recommended: 120×24px or similar aspect ratio.",
			es: "PNG, SVG o WebP. Recomendado: 120×24px o proporción similar.",
		}),
		faviconLabel: t({ en: "Favicon", es: "Favicon" }),
		faviconHint: t({
			en: "ICO, PNG, or SVG. Recommended: 32×32px or 16×16px.",
			es: "ICO, PNG o SVG. Recomendado: 32×32px o 16×16px.",
		}),
		logoDisplayLabel: t({ en: "Logo Display", es: "Mostrar Logo" }),
		logoDisplayText: t({ en: "Text", es: "Texto" }),
		logoDisplayImage: t({ en: "Image", es: "Imagen" }),
		logoDisplayBoth: t({ en: "Both", es: "Ambos" }),

		// Style customization section
		customizeTitle: t({ en: "Style Customization", es: "Personalización de Estilo" }),
		typographyTitle: t({ en: "Typography", es: "Tipografía" }),
		codeBlocksTitle: t({ en: "Code Blocks", es: "Bloques de Código" }),
		appearanceTitle: t({ en: "Appearance", es: "Apariencia" }),
		borderRadiusLabel: t({ en: "Border Radius", es: "Radio de Borde" }),
		spacingLabel: t({ en: "Spacing", es: "Espaciado" }),

		// Color section
		colorTitle: t({ en: "Accent Color", es: "Color de Acento" }),

		// Theme preset section
		presetTitle: t({ en: "Theme Preset", es: "Tema Preestablecido" }),
		presetHint: t({
			en: "Choose a preset or customize individual settings below.",
			es: "Elige un tema preestablecido o personaliza los ajustes individuales a continuación.",
		}),
		presetCustom: t({ en: "Custom", es: "Personalizado" }),
		presetMinimal: t({ en: "Minimal", es: "Minimalista" }),
		presetMinimalDesc: t({ en: "Clean and professional", es: "Limpio y profesional" }),
		presetVibrant: t({ en: "Vibrant", es: "Vibrante" }),
		presetVibrantDesc: t({ en: "Bold and energetic", es: "Audaz y enérgico" }),
		presetTerminal: t({ en: "Terminal", es: "Terminal" }),
		presetTerminalDesc: t({ en: "Developer-first", es: "Para desarrolladores" }),
		presetFriendly: t({ en: "Friendly", es: "Amigable" }),
		presetFriendlyDesc: t({ en: "Warm and approachable", es: "Cálido y accesible" }),
		presetNoir: t({ en: "Noir", es: "Noir" }),
		presetNoirDesc: t({ en: "Sleek and premium", es: "Elegante y premium" }),

		// Identity section (logo, favicon)
		identityTitle: t({ en: "Logo & Icon", es: "Logo e Icono" }),
		invalidUrlError: t({
			en: "URL must start with http:// or https://",
			es: "La URL debe comenzar con http:// o https://",
		}),

		// Default theme section
		themeTitle: t({ en: "Default Theme", es: "Tema Predeterminado" }),
		themeSystem: t({ en: "System", es: "Sistema" }),
		themeLight: t({ en: "Light", es: "Claro" }),
		themeDark: t({ en: "Dark", es: "Oscuro" }),

		// Header links section
		headerLinksTitle: t({ en: "Header Navigation", es: "Navegación del Encabezado" }),
		headerLinksHint: t({
			en: "Add up to 6 items. Each can be a direct link or a dropdown menu.",
			es: "Agrega hasta 6 elementos. Cada uno puede ser un enlace directo o un menú desplegable.",
		}),
		addNavItemButton: t({ en: "Add Item", es: "Agregar Elemento" }),
		addLinkButton: t({ en: "Add Link", es: "Agregar Enlace" }),
		navItemTypeLink: t({ en: "Link", es: "Enlace" }),
		navItemTypeDropdown: t({ en: "Dropdown", es: "Desplegable" }),

		// Footer section
		footerTitle: t({ en: "Footer", es: "Pie de Página" }),
		copyrightLabel: t({ en: "Copyright", es: "Copyright" }),
		footerColumnsLabel: t({ en: "Columns", es: "Columnas" }),
		addColumnButton: t({ en: "Add Column", es: "Agregar Columna" }),
		socialLinksLabel: t({ en: "Social Links", es: "Enlaces Sociales" }),
		poweredByNote: t({
			en: '"Powered by Jolli" will always appear in the footer',
			es: '"Powered by Jolli" siempre aparecerá en el pie de página',
		}),

		// Navigation section (combines header links + layout)
		navigationTitle: t({ en: "Navigation", es: "Navegación" }),
		navigationModeLabel: t({ en: "Navigation Mode", es: "Modo de Navegación" }),
		navModeSidebar: t({ en: "Sidebar", es: "Barra Lateral" }),
		navModeSidebarDesc: t({ en: "All sections in sidebar", es: "Todas las secciones en barra lateral" }),
		navModeTabs: t({ en: "Tabs", es: "Pestañas" }),
		navModeTabsDesc: t({ en: "Top sections as tabs", es: "Secciones principales como pestañas" }),

		// Layout section (sidebar/toc settings)
		layoutTitle: t({ en: "Page Layout", es: "Diseño de Página" }),
		hideTocLabel: t({ en: 'Hide "On This Page" sidebar', es: 'Ocultar barra lateral "En Esta Página"' }),
		tocTitleLabel: t({ en: "TOC Title", es: "Título del Índice" }),
		sidebarCollapseLabel: t({ en: "Sidebar Depth", es: "Profundidad de la Barra" }),
		sidebarCollapseHint: t({
			en: "How many folder levels to expand by default",
			es: "Cuántos niveles de carpetas expandir por defecto",
		}),

		// Layout width controls
		pageWidthLabel: t({ en: "Page Width", es: "Ancho de Página" }),
		pageWidthHint: t({
			en: "Overall page container max-width",
			es: "Ancho máximo del contenedor de página",
		}),
		pageWidthCompact: t({ en: "Compact", es: "Compacto" }),
		pageWidthStandard: t({ en: "Standard", es: "Estándar" }),
		pageWidthWide: t({ en: "Wide", es: "Ancho" }),

		contentWidthLabel: t({ en: "Content Width", es: "Ancho del Contenido" }),
		contentWidthHint: t({
			en: "Max width of article text for readability",
			es: "Ancho máximo del texto del artículo para legibilidad",
		}),
		contentWidthCompact: t({ en: "Compact", es: "Compacto" }),
		contentWidthStandard: t({ en: "Standard", es: "Estándar" }),
		contentWidthWide: t({ en: "Wide", es: "Ancho" }),

		sidebarWidthLabel: t({ en: "Sidebar Width", es: "Ancho de Barra Lateral" }),
		sidebarWidthHint: t({
			en: "Width of the left navigation panel",
			es: "Ancho del panel de navegación izquierdo",
		}),
		sidebarWidthCompact: t({ en: "Compact", es: "Compacto" }),
		sidebarWidthStandard: t({ en: "Standard", es: "Estándar" }),
		sidebarWidthWide: t({ en: "Wide", es: "Ancho" }),

		tocWidthLabel: t({ en: "TOC Width", es: "Ancho del Índice" }),
		tocWidthHint: t({
			en: "Width of the table of contents panel",
			es: "Ancho del panel de índice de contenidos",
		}),
		tocWidthCompact: t({ en: "Compact", es: "Compacto" }),
		tocWidthStandard: t({ en: "Standard", es: "Estándar" }),
		tocWidthWide: t({ en: "Wide", es: "Ancho" }),

		headerAlignmentLabel: t({
			en: "Header & Footer Alignment",
			es: "Alineación del Encabezado y Pie",
		}),
		headerAlignmentHint: t({
			en: "Controls nav link alignment in both the header and footer",
			es: "Controla la alineación de los enlaces de navegación en el encabezado y el pie de página",
		}),
		headerAlignmentLeft: t({ en: "Left", es: "Izquierda" }),
		headerAlignmentRight: t({ en: "Right", es: "Derecha" }),

		// Actions
		rebuildNote: t({
			en: "Branding changes require publishing the site to take effect.",
			es: "Los cambios de marca requieren publicar el sitio para aplicarse.",
		}),
		resetButton: t({ en: "Reset", es: "Restablecer" }),
		saveButton: t({ en: "Save Changes", es: "Guardar Cambios" }),
		savingButton: t({ en: "Saving...", es: "Guardando..." }),
	},
} satisfies Dictionary;

export default siteBrandingTabContent;
