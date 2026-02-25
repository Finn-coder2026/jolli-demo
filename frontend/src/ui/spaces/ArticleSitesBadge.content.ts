import { type Dictionary, t } from "intlayer";

const articleSitesBadgeContent = {
	key: "article-sites-badge",
	content: {
		publishedSites: t({
			en: "Published Sites",
			es: "Sitios publicados",
		}),
		external: t({
			en: "Public",
			es: "P\u00fablico",
		}),
		internal: t({
			en: "Internal",
			es: "Interno",
		}),
	},
} satisfies Dictionary;

export default articleSitesBadgeContent;
