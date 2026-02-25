import { type Dictionary, t } from "intlayer";

const siteNavigationTabContent = {
	key: "site-navigation-tab",
	content: {
		title: t({
			en: "Sidebar Navigation",
			es: "Navegación del Sidebar",
		}),
		description: t({
			en: "Edit _meta.ts files to customize menu titles, ordering, and structure. Content files are shown for reference.",
			es: "Edita archivos _meta.ts para personalizar títulos, orden y estructura del menú. Los archivos de contenido se muestran como referencia.",
		}),
		noNavigationFile: t({
			en: "No navigation files found. Meta files will be created automatically when you add content.",
			es: "No se encontraron archivos de navegación. Los archivos meta se crearán automáticamente al agregar contenido.",
		}),
		folderStructureBanner: t({
			en: "Auto-sync is enabled — navigation mirrors your space structure. Disable in Settings to edit manually.",
			es: "La sincronización automática está activada — la navegación refleja la estructura de tus espacios. Desactiva en Configuración para editar manualmente.",
		}),
	},
} satisfies Dictionary;

export default siteNavigationTabContent;
