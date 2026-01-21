import { type Dictionary, t } from "intlayer";

const siteOverviewTabContent = {
	key: "site-overview-tab",
	content: {
		title: t({
			en: "Overview",
			es: "Resumen",
		}),
		// Quick stats
		articlesCount: t({
			en: "Articles",
			es: "Artículos",
		}),
		lastBuilt: t({
			en: "Last Built",
			es: "Última Construcción",
		}),
		created: t({
			en: "Created",
			es: "Creado",
		}),
		// Status
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
		// Preview
		buildInProgress: t({
			en: "Build in Progress",
			es: "Construcción en Progreso",
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
		// Site URL
		siteUrl: t({
			en: "Site URL",
			es: "URL del Sitio",
		}),
		openSite: t({
			en: "Open Site",
			es: "Abrir Sitio",
		}),
		copiedToClipboard: t({
			en: "Copied!",
			es: "Copiado!",
		}),
		// Quick actions
		quickActions: t({
			en: "Quick Actions",
			es: "Acciones Rápidas",
		}),
		viewLogs: t({
			en: "View Build Logs",
			es: "Ver Registros de Construcción",
		}),
		editContent: t({
			en: "Edit Content",
			es: "Editar Contenido",
		}),
		configureSettings: t({
			en: "Configure Settings",
			es: "Configurar Ajustes",
		}),
		// Recent activity placeholder
		recentActivity: t({
			en: "Recent Activity",
			es: "Actividad Reciente",
		}),
		noRecentActivity: t({
			en: "No recent activity",
			es: "Sin actividad reciente",
		}),
	},
} satisfies Dictionary;

export default siteOverviewTabContent;
