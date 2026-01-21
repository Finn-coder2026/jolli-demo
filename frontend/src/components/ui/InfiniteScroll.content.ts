import { type Dictionary, t } from "intlayer";

const infiniteScrollContent = {
	key: "infinite-scroll",
	content: {
		empty: t({
			en: "No data available",
			es: "No hay datos disponibles",
		}),
		noMore: t({
			en: "No more data",
			es: "No hay mas datos",
		}),
		error: t({
			en: "Failed to load data",
			es: "Error al cargar datos",
		}),
	},
} satisfies Dictionary;

export default infiniteScrollContent;
