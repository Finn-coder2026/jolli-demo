import { type Dictionary, t } from "intlayer";

const articleLinkNodeViewContent = {
	key: "article-link-node-view",
	content: {
		notFound: t({
			en: "This article no longer exists or has been deleted",
			es: "Este artículo ya no existe o ha sido eliminado",
		}),
		fetchError: t({
			en: "Failed to load article",
			es: "Error al cargar el artículo",
		}),
	},
} satisfies Dictionary;

export default articleLinkNodeViewContent;
