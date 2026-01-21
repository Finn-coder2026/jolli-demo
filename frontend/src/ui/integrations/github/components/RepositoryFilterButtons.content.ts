import { type Dictionary, insert, t } from "intlayer";

const repositoryFilterButtonsContent = {
	key: "repository-filter-buttons",
	content: {
		allRepos: t({ en: "All Repos", es: "Todos los Repos" }),
		enabledOnly: t({
			en: insert("Enabled Only ({{count}})"),
			es: insert("Solo Habilitados ({{count}})"),
		}),
	},
} satisfies Dictionary;

export default repositoryFilterButtonsContent;
