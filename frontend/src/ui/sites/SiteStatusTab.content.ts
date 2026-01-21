import { type Dictionary, t } from "intlayer";

const siteStatusTabContent = {
	key: "site-status-tab",
	content: {
		title: t({
			en: "Status & Preview",
			es: "Estado y Vista Previa",
		}),
		buildStatus: t({
			en: "Build Status",
			es: "Estado de Construcción",
		}),
		statusPending: t({
			en: "Pending",
			es: "Pendiente",
		}),
		statusBuilding: t({
			en: "Building",
			es: "Construyendo",
		}),
		statusActive: t({
			en: "Active",
			es: "Activo",
		}),
		statusError: t({
			en: "Error",
			es: "Error",
		}),
		buildInProgress: t({
			en: "Build in Progress",
			es: "Construcción en Progreso",
		}),
		visibility: t({
			en: "Visibility",
			es: "Visibilidad",
		}),
		visibilityInternal: t({
			en: "Internal",
			es: "Interno",
		}),
		visibilityExternal: t({
			en: "External",
			es: "Externo",
		}),
		framework: t({
			en: "Framework",
			es: "Framework",
		}),
		allowedDomain: t({
			en: "Allowed Domain",
			es: "Dominio Permitido",
		}),
		protectionType: t({
			en: "Protection Type",
			es: "Tipo de Protección",
		}),
		siteUrl: t({
			en: "Site URL",
			es: "URL del Sitio",
		}),
		manageCustomDomain: t({
			en: "Connect custom domain →",
			es: "Conectar dominio personalizado →",
		}),
		customDomainSettings: t({
			en: "Custom domain settings →",
			es: "Configuración de dominio personalizado →",
		}),
		hideCustomDomain: t({
			en: "← Hide",
			es: "← Ocultar",
		}),
		lastBuilt: t({
			en: "Last Built",
			es: "Última Construcción",
		}),
		lastDeployed: t({
			en: "Last Deployed",
			es: "Último Despliegue",
		}),
		protectionLastChecked: t({
			en: "Last Checked",
			es: "Última Verificación",
		}),
		protectionRefresh: t({
			en: "Refresh Status",
			es: "Actualizar Estado",
		}),
		internalSiteDescription: t({
			en: "Internal sites require users to log in with an email from the allowed domain. Authentication is handled at the application level.",
			es: "Los sitios internos requieren que los usuarios inicien sesión con un correo del dominio permitido. La autenticación se maneja a nivel de aplicación.",
		}),
		externalSiteDescription: t({
			en: "External sites can be published to make them publicly accessible, or unpublished to restrict access.",
			es: "Los sitios externos pueden publicarse para hacerlos públicamente accesibles, o despublicarse para restringir el acceso.",
		}),
		buildErrors: t({
			en: "Build Errors",
			es: "Errores de Construcción",
		}),
		lastBuildError: t({
			en: "Last Build Error",
			es: "Último Error de Construcción",
		}),
		// JWT Authentication
		jwtAuthTitle: t({
			en: "Authentication",
			es: "Autenticación",
		}),
		enableAuthLabel: t({
			en: "Enable Auth Mode",
			es: "Habilitar Modo de Autenticación",
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
			en: "Jolli will authenticate users and ensure they belong to your tenant",
			es: "Jolli autenticará a los usuarios y se asegurará de que pertenezcan a tu organización",
		}),
		jwtAuthLoginUrl: t({
			en: "Login URL",
			es: "URL de Inicio de Sesión",
		}),
		jwtAuthSaving: t({
			en: "Saving...",
			es: "Guardando...",
		}),
		deploymentBuilding: t({
			en: "Deployment Building",
			es: "Despliegue en Construcción",
		}),
		deploymentBuildingDescription: t({
			en: "Vercel is building your site...",
			es: "Vercel está construyendo tu sitio...",
		}),
		previewUnavailable: t({
			en: "Preview Unavailable",
			es: "Vista Previa No Disponible",
		}),
		previewRequiresAuth: t({
			en: "Site requires authentication",
			es: "El sitio requiere autenticación",
		}),
		redeployRequired: t({
			en: "Redeploy required for changes to take effect",
			es: "Se requiere redespliegue para que los cambios surtan efecto",
		}),
		authEnabledNote: t({
			en: "If you just created this site with authentication enabled, you will need to rebuild for it to take effect.",
			es: "Si acaba de crear este sitio con autenticación habilitada, deberá reconstruirlo para que surta efecto.",
		}),
	},
} satisfies Dictionary;

export default siteStatusTabContent;
