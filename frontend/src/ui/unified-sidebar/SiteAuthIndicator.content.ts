import { type Dictionary, t } from "intlayer";

const siteAuthIndicatorContent = {
	key: "site-auth-indicator",
	content: {
		authPublic: t({
			en: "Public",
			es: "Público",
		}),
		authProtected: t({
			en: "Protected",
			es: "Protegido",
		}),
	},
} satisfies Dictionary;

export default siteAuthIndicatorContent;
