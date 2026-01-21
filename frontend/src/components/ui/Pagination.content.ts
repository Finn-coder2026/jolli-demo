import { type Dictionary, t } from "intlayer";

const paginationContent = {
	key: "pagination",
	content: {
		ariaLabel: t({
			en: "Pagination",
			es: "Paginación",
		}),
		previousPage: t({
			en: "Previous page",
			es: "Página anterior",
		}),
		nextPage: t({
			en: "Next page",
			es: "Página siguiente",
		}),
		page: t({
			en: "Page",
			es: "Página",
		}),
	},
} satisfies Dictionary;

export default paginationContent;
