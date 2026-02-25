import { type Dictionary, t } from "intlayer";

const orgTenantSelectorContent = {
	key: "org-tenant-selector",
	content: {
		switchOrganization: t({
			en: "Switch Organization",
			es: "Cambiar Organización",
		}),
		switchTenant: t({
			en: "Switch Tenant",
			es: "Cambiar Inquilino",
		}),
		openInNewTab: t({
			en: "Open in new tab",
			es: "Abrir en nueva pestaña",
		}),
		noOrganizations: t({
			en: "No organizations available",
			es: "No hay organizaciones disponibles",
		}),
		noTenants: t({
			en: "No tenants available",
			es: "No hay inquilinos disponibles",
		}),
		organizations: t({
			en: "Organizations",
			es: "Organizaciones",
		}),
		tenants: t({
			en: "Tenants",
			es: "Inquilinos",
		}),
	},
} satisfies Dictionary;

export default orgTenantSelectorContent;
