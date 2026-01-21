import { type Dictionary, t } from "intlayer";

const siteSettingsTabContent = {
	key: "site-settings-tab",
	content: {
		title: t({
			en: "Settings",
			es: "Configuración",
		}),
		// Authentication section
		authenticationTitle: t({
			en: "Authentication",
			es: "Autenticación",
		}),
		authenticationDescription: t({
			en: "Control who can access your documentation site",
			es: "Controla quién puede acceder a tu sitio de documentación",
		}),
		enableAuthLabel: t({
			en: "Require Authentication",
			es: "Requerir Autenticación",
		}),
		enableAuthDescription: t({
			en: "Users must sign in before viewing this site",
			es: "Los usuarios deben iniciar sesión antes de ver este sitio",
		}),
		authMethodLabel: t({
			en: "Authentication Provider",
			es: "Proveedor de Autenticación",
		}),
		authMethodJolli: t({
			en: "Jolli",
			es: "Jolli",
		}),
		authMethodJolliDescription: t({
			en: "Authenticate users through your Jolli organization",
			es: "Autenticar usuarios a través de tu organización Jolli",
		}),
		loginUrl: t({
			en: "Login URL",
			es: "URL de Inicio de Sesión",
		}),
		saving: t({
			en: "Saving...",
			es: "Guardando...",
		}),
		authRebuildNote: t({
			en: "Authentication changes require a site rebuild to take effect.",
			es: "Los cambios de autenticación requieren reconstruir el sitio para aplicarse.",
		}),
		// Domain section
		domainTitle: t({
			en: "Custom Domain",
			es: "Dominio Personalizado",
		}),
		domainDescription: t({
			en: "Connect your own domain to this documentation site",
			es: "Conecta tu propio dominio a este sitio de documentación",
		}),
		currentDomain: t({
			en: "Current Domain",
			es: "Dominio Actual",
		}),
		defaultDomain: t({
			en: "Default Domain",
			es: "Dominio Predeterminado",
		}),
		hideDomainManager: t({
			en: "Hide",
			es: "Ocultar",
		}),
		manageDomain: t({
			en: "Manage",
			es: "Administrar",
		}),
		addDomain: t({
			en: "Add Domain",
			es: "Agregar Dominio",
		}),
		// Danger zone
		dangerZoneTitle: t({
			en: "Danger Zone",
			es: "Zona de Peligro",
		}),
		deleteSiteButton: t({
			en: "Delete Site",
			es: "Eliminar Sitio",
		}),
		deleteSiteDescription: t({
			en: "Permanently delete this site and all associated resources. This action cannot be undone.",
			es: "Eliminar permanentemente este sitio y todos los recursos asociados. Esta acción no se puede deshacer.",
		}),
		// Section headers
		sectionGeneral: t({
			en: "General",
			es: "General",
		}),
		sectionAccess: t({
			en: "Access Control",
			es: "Control de Acceso",
		}),
		// Unsaved changes
		unsavedChanges: t({
			en: "You have unsaved changes",
			es: "Tienes cambios sin guardar",
		}),
		saveChanges: t({
			en: "Save Changes",
			es: "Guardar Cambios",
		}),
		changesSaved: t({
			en: "Changes saved",
			es: "Cambios guardados",
		}),
	},
} satisfies Dictionary;

export default siteSettingsTabContent;
