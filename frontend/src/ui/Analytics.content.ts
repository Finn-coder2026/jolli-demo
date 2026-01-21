import { type Dictionary, t } from "intlayer";

const analyticsContent = {
	key: "analytics",
	content: {
		title: t({
			en: "Analytics",
			es: "Analíticas",
		}),
		subtitle: t({
			en: "View your documentation analytics",
			es: "Ver las analíticas de tu documentación",
		}),
	},
} satisfies Dictionary;

export default analyticsContent;
