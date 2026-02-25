import { type Dictionary, t } from "intlayer";

const collapsibleBreadcrumbContent = {
	key: "collapsible-breadcrumb",
	content: {
		breadcrumbNavigation: t({
			en: "Breadcrumb navigation",
			es: "Navegación de migas de pan",
		}),
		collapsedFolders: t({
			en: "Collapsed folders",
			es: "Carpetas colapsadas",
		}),
	},
} satisfies Dictionary;

export default collapsibleBreadcrumbContent;
