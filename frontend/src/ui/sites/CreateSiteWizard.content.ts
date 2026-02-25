import { type Dictionary, t } from "intlayer";

const createSiteWizardContent = {
	key: "create-site-wizard",
	content: {
		title: t({
			en: "Create New Site",
			es: "Crear Nuevo Sitio",
		}),

		stepBasics: t({
			en: "Basics",
			es: "Básicos",
		}),
		stepContent: t({
			en: "Content",
			es: "Contenido",
		}),
		stepBranding: t({
			en: "Branding",
			es: "Marca",
		}),
		stepAccess: t({
			en: "Access",
			es: "Acceso",
		}),

		basicsTitle: t({
			en: "Name your site",
			es: "Nombra tu sitio",
		}),
		basicsDescription: t({
			en: "Choose a name and URL for your documentation site.",
			es: "Elige un nombre y URL para tu sitio de documentación.",
		}),
		displayNameLabel: t({
			en: "Display Name",
			es: "Nombre para Mostrar",
		}),
		displayNamePlaceholder: t({
			en: "My Documentation",
			es: "Mi Documentación",
		}),
		displayNameHelp: t({
			en: "This is the name visitors will see in the site header.",
			es: "Este es el nombre que los visitantes verán en el encabezado del sitio.",
		}),
		siteNameLabel: t({
			en: "Site Name",
			es: "Nombre del Sitio",
		}),
		siteNamePlaceholder: t({
			en: "my-docs",
			es: "mis-docs",
		}),
		siteNameHelp: t({
			en: "Lowercase letters, numbers, and hyphens only. Used as the internal identifier.",
			es: "Solo letras minúsculas, números y guiones. Usado como identificador interno.",
		}),

		contentTitle: t({
			en: "Select content",
			es: "Seleccionar contenido",
		}),
		contentDescription: t({
			en: "Choose which articles to include in your site. You can change this later.",
			es: "Elige qué artículos incluir en tu sitio. Puedes cambiar esto después.",
		}),
		loadingArticles: t({
			en: "Loading articles...",
			es: "Cargando artículos...",
		}),
		noArticlesAvailable: t({
			en: "No articles available. Create some articles first.",
			es: "No hay artículos disponibles. Crea algunos artículos primero.",
		}),

		useSpaceFolderStructure: t({
			en: "Auto-sync navigation from spaces (Recommended)",
			es: "Sincronizar navegación desde espacios (Recomendado)",
		}),
		useSpaceFolderStructureDescription: t({
			en: "Navigation is automatically derived from how articles are organized in your spaces.",
			es: "La navegación se deriva automáticamente de cómo están organizados los artículos en tus espacios.",
		}),

		brandingTitle: t({
			en: "Choose a theme",
			es: "Elige un tema",
		}),
		brandingDescription: t({
			en: "Select a theme preset for your site. You can customize colors and more after creation.",
			es: "Selecciona un tema para tu sitio. Puedes personalizar colores y más después de crearlo.",
		}),
		brandingNote: t({
			en: "You can fully customize your branding including logo, colors, and fonts after the site is created.",
			es: "Puedes personalizar completamente tu marca incluyendo logo, colores y fuentes después de crear el sitio.",
		}),
		logoSectionTitle: t({
			en: "Logo & Favicon",
			es: "Logo y Favicon",
		}),
		logoDisplayLabel: t({
			en: "Logo Display",
			es: "Mostrar Logo",
		}),
		logoDisplayText: t({
			en: "Text",
			es: "Texto",
		}),
		logoDisplayImage: t({
			en: "Image",
			es: "Imagen",
		}),
		logoDisplayBoth: t({
			en: "Both",
			es: "Ambos",
		}),
		logoTextLabel: t({
			en: "Logo Text",
			es: "Texto del Logo",
		}),
		logoUrlLabel: t({
			en: "Logo Image URL",
			es: "URL de Imagen del Logo",
		}),
		faviconUrlLabel: t({
			en: "Favicon URL",
			es: "URL del Favicon",
		}),

		accessTitle: t({
			en: "Who can access your site?",
			es: "¿Quién puede acceder a tu sitio?",
		}),
		accessDescription: t({
			en: "Choose whether your site is publicly accessible or restricted to your team.",
			es: "Elige si tu sitio es públicamente accesible o restringido a tu equipo.",
		}),
		accessPublicTitle: t({
			en: "Public",
			es: "Público",
		}),
		accessPublicDescription: t({
			en: "Anyone with the link can view your documentation site.",
			es: "Cualquiera con el enlace puede ver tu sitio de documentación.",
		}),
		accessRestrictedTitle: t({
			en: "Restricted to Jolli users",
			es: "Restringido a usuarios de Jolli",
		}),
		accessRestrictedDescription: t({
			en: "Only users with a Jolli account in your organization can access this site.",
			es: "Solo usuarios con una cuenta de Jolli en tu organización pueden acceder a este sitio.",
		}),
		accessRestrictedNote: t({
			en: "Visitors will need to sign in with their Jolli account to view the site. The site preview will show a lock icon.",
			es: "Los visitantes necesitarán iniciar sesión con su cuenta de Jolli para ver el sitio. La vista previa del sitio mostrará un icono de candado.",
		}),

		backButton: t({
			en: "Back",
			es: "Atrás",
		}),
		nextButton: t({
			en: "Next",
			es: "Siguiente",
		}),
		skipButton: t({
			en: "Skip",
			es: "Omitir",
		}),
		cancelButton: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		createButton: t({
			en: "Create Site",
			es: "Crear Sitio",
		}),
		creatingButton: t({
			en: "Creating...",
			es: "Creando...",
		}),
		useDefaultsNote: t({
			en: "Using your last settings",
			es: "Usando tu configuración anterior",
		}),

		creatingTitle: t({
			en: "Creating your site...",
			es: "Creando tu sitio...",
		}),
		creatingDescription: t({
			en: "This may take a moment. We're setting up your documentation site.",
			es: "Esto puede tardar un momento. Estamos configurando tu sitio de documentación.",
		}),

		errorNameTooShort: t({
			en: "Site name must be at least 3 characters",
			es: "El nombre del sitio debe tener al menos 3 caracteres",
		}),
		errorDisplayNameRequired: t({
			en: "Display name is required",
			es: "El nombre para mostrar es requerido",
		}),
		errorSubdomainInvalidChars: t({
			en: "Subdomain can only contain lowercase letters, numbers, and hyphens",
			es: "El subdominio solo puede contener letras minúsculas, números y guiones",
		}),
		errorSubdomainInvalid: t({
			en: "Please enter a valid subdomain",
			es: "Por favor ingresa un subdominio válido",
		}),
		errorLoadingArticles: t({
			en: "Failed to load articles",
			es: "Error al cargar artículos",
		}),
		errorCreatingFailed: t({
			en: "Failed to create site. Please try again.",
			es: "Error al crear el sitio. Por favor intenta de nuevo.",
		}),
		previewLabel: t({
			en: "Preview",
			es: "Vista Previa",
		}),
		previewDarkMode: t({
			en: "Dark",
			es: "Oscuro",
		}),
		previewLightMode: t({
			en: "Light",
			es: "Claro",
		}),
		previewButton: t({
			en: "Button",
			es: "Botón",
		}),
	},
} satisfies Dictionary;

export default createSiteWizardContent;
