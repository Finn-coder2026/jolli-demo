import { type Dictionary, t } from "intlayer";

const loadingStateContent = {
	key: "loading-state",
	content: {
		loading: t({
			en: "Loading...",
			es: "Cargando...",
		}),
	},
} satisfies Dictionary;

export default loadingStateContent;
