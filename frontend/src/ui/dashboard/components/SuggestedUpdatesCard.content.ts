import { type Dictionary, t } from "intlayer";

const suggestedUpdatesCardContent = {
	key: "suggested-updates-card",
	content: {
		title: t({
			en: "Suggested Updates",
			es: "Actualizaciones sugeridas",
		}),
		viewAll: t({
			en: "View All",
			es: "Ver todo",
		}),
		loading: t({
			en: "Loading...",
			es: "Cargando...",
		}),
		suggestions: t({
			en: "suggestions",
			es: "sugerencias",
		}),
	},
} satisfies Dictionary;

export default suggestedUpdatesCardContent;
