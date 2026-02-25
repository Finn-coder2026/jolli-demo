import { type Dictionary, t } from "intlayer";

const articleOutlineContent = {
	key: "article-outline",
	content: {
		onThisPage: t({
			en: "On this page",
			es: "En esta página",
		}),
	},
} satisfies Dictionary;

export default articleOutlineContent;
