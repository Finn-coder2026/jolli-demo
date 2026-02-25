import { type Dictionary, t } from "intlayer";

const resizableImageContent = {
	key: "resizable-image",
	content: {
		couldNotBeFound: t({
			en: "could not be found",
			es: "no se pudo encontrar",
		}),
	},
} satisfies Dictionary;

export default resizableImageContent;
