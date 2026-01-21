import { type Dictionary, t } from "intlayer";

const createSiteDialogContent = {
	key: "create-site-dialog",
	content: {
		title: t({
			en: "Create new site",
			es: "Crear nuevo sitio",
		}),
		subtitle: t({
			en: "Generate a documentation site from all your articles",
			es: "Generar un sitio de documentación desde todos tus artículos",
		}),
		// Form labels
		siteNameLabel: t({
			en: "Site Name",
			es: "Nombre del Sitio",
		}),
		siteNamePlaceholder: t({
			en: "my-docs-site",
			es: "mi-sitio-docs",
		}),
		siteNameHelp: t({
			en: "Lowercase letters, numbers, and hyphens only. Used as a unique identifier for your site.",
			es: "Solo letras minúsculas, números y guiones. Se usa como identificador único de tu sitio.",
		}),
		displayNameLabel: t({
			en: "Display Name",
			es: "Nombre de Visualización",
		}),
		displayNamePlaceholder: t({
			en: "My Documentation Site",
			es: "Mi Sitio de Documentación",
		}),
		displayNameHelp: t({
			en: "The title that will appear on your documentation site",
			es: "El título que aparecerá en tu sitio de documentación",
		}),
		siteStyleLabel: t({
			en: "Site Type",
			es: "Tipo de Sitio",
		}),
		siteStyleHelp: t({
			en: "Choose the type of site you want to create",
			es: "Elige el tipo de sitio que deseas crear",
		}),
		// Settings step
		settingsLabel: t({
			en: "Settings",
			es: "Configuración",
		}),
		enableAuthLabel: t({
			en: "Enable Authentication",
			es: "Habilitar Autenticación",
		}),
		enableAuthDescription: t({
			en: "Require users to authenticate before accessing this site",
			es: "Requerir que los usuarios se autentiquen antes de acceder a este sitio",
		}),
		authMethodLabel: t({
			en: "Authentication Method",
			es: "Método de Autenticación",
		}),
		authMethodJolli: t({
			en: "Jolli",
			es: "Jolli",
		}),
		authMethodJolliDescription: t({
			en: "Requires authentication to access your site.",
			es: "Requiere autenticación para acceder a tu sitio.",
		}),
		// Article info
		articlesInfoTitle: t({
			en: "Articles",
			es: "Artículos",
		}),
		articlesInfoDescription: t({
			en: "Select which articles to include in this site",
			es: "Selecciona qué artículos incluir en este sitio",
		}),
		articlesCount: t({
			en: "articles available",
			es: "artículos disponibles",
		}),
		loadingArticles: t({
			en: "Loading articles...",
			es: "Cargando artículos...",
		}),
		noArticlesAvailable: t({
			en: "No articles available. Create some articles first.",
			es: "No hay artículos disponibles. Crea algunos artículos primero.",
		}),
		selectArticlesRequired: t({
			en: "Please select at least one article",
			es: "Por favor selecciona al menos un artículo",
		}),
		// Site type options
		siteTypeDocumentSite: t({
			en: "Document site",
			es: "Sitio de documentación",
		}),
		siteTypeWikiSite: t({
			en: "Wiki site",
			es: "Sitio wiki",
		}),
		// Framework options
		frameworkLabel: t({
			en: "Framework",
			es: "Framework",
		}),
		frameworkHelp: t({
			en: "Choose the framework to build your site",
			es: "Elige el framework para construir tu sitio",
		}),
		frameworkNextra: t({
			en: "Nextra",
			es: "Nextra",
		}),
		frameworkDocusaurus: t({
			en: "Docusaurus",
			es: "Docusaurus",
		}),
		// Buttons
		cancelButton: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		backButton: t({
			en: "Back",
			es: "Atrás",
		}),
		nextButton: t({
			en: "Next",
			es: "Siguiente",
		}),
		createButton: t({
			en: "Create Site",
			es: "Crear Sitio",
		}),
		creatingButton: t({
			en: "Creating...",
			es: "Creando...",
		}),
		creatingMessage: t({
			en: "This will take a few moments. We're setting up and building your site...",
			es: "Esto tomará unos momentos. Estamos configurando y construyendo tu sitio...",
		}),
		// Errors
		errorNameRequired: t({
			en: "Site name is required",
			es: "El nombre del sitio es requerido",
		}),
		errorNameInvalid: t({
			en: "Site name must be lowercase alphanumeric with hyphens only",
			es: "El nombre del sitio debe ser alfanumérico en minúsculas con guiones solamente",
		}),
		errorNameTaken: t({
			en: "A site with this name already exists",
			es: "Ya existe un sitio con este nombre",
		}),
		errorDisplayNameRequired: t({
			en: "Display name is required",
			es: "El nombre de visualización es requerido",
		}),
		errorNameTooShort: t({
			en: "Site name must be at least 3 characters",
			es: "El nombre del sitio debe tener al menos 3 caracteres",
		}),
		errorSubdomainTooShort: t({
			en: "Subdomain must be at least 3 characters",
			es: "El subdominio debe tener al menos 3 caracteres",
		}),
		errorSubdomainTooLong: t({
			en: "Subdomain must be 63 characters or less",
			es: "El subdominio debe tener 63 caracteres o menos",
		}),
		errorSubdomainInvalidChars: t({
			en: "Subdomain can only contain lowercase letters, numbers, and hyphens",
			es: "El subdominio solo puede contener letras minúsculas, números y guiones",
		}),
		errorSubdomainInvalidFormat: t({
			en: "Subdomain cannot start or end with a hyphen",
			es: "El subdominio no puede comenzar o terminar con un guión",
		}),
		errorCreationFailed: t({
			en: "Failed to create site. Please try again.",
			es: "Error al crear el sitio. Por favor, intenta de nuevo.",
		}),
		errorLoadingArticles: t({
			en: "Failed to load article information",
			es: "Error al cargar la información de artículos",
		}),
	},
} satisfies Dictionary;

export default createSiteDialogContent;
