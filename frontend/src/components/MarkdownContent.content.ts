import { type Dictionary, t } from "intlayer";

const markdownContentContent = {
	key: "markdown-content",
	content: {
		notFound: t({
			en: "This article no longer exists or has been deleted",
			es: "Este articulo ya no existe o ha sido eliminado",
		}),
		fetchError: t({
			en: "Failed to load article",
			es: "Error al cargar el articulo",
		}),
	},
} satisfies Dictionary;

export default markdownContentContent;
