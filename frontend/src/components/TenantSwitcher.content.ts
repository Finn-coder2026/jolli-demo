import { type Dictionary, t } from "intlayer";

const tenantSwitcherContent = {
	key: "tenant-switcher",
	content: {
		switchTenant: t({
			en: "Switch Tenant",
			es: "Cambiar Inquilino",
		}),
		openInNewTab: t({
			en: "Open in new tab",
			es: "Abrir en nueva pestana",
		}),
		noTenantsAvailable: t({
			en: "No other tenants available",
			es: "No hay otros inquilinos disponibles",
		}),
		currentTenant: t({
			en: "Current Tenant",
			es: "Inquilino Actual",
		}),
	},
} satisfies Dictionary;

export default tenantSwitcherContent;
