import { type Dictionary, t } from "intlayer";

const languageSwitcherContent = {
	key: "language-switcher",
	content: {
		label: t({
			en: "Language",
			es: "Idioma",
		}),
		english: t({
			en: "English",
			es: "Inglés",
		}),
		spanish: t({
			en: "Spanish",
			es: "Español",
		}),
	},
} satisfies Dictionary;

export default languageSwitcherContent;
