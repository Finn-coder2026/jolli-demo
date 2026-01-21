import { type Dictionary, enu, insert, t } from "intlayer";

const integrationCardContent = {
	key: "integration-card",
	content: {
		lastSynced: t({
			en: insert("Last synced: {{date}}"),
			es: insert("Última sincronización: {{date}}"),
		}),
		organizationsCount: t({
			en: insert("{{count}} {{organizations}}"),
			es: insert("{{count}} {{organizations}}"),
		}),
		organizations: enu({
			"0": t({
				en: "organizations",
				es: "organizaciones",
			}),
			"1": t({
				en: "organization",
				es: "organización",
			}),
			fallback: t({
				en: "organizations",
				es: "organizaciones",
			}),
		}),
		reposEnabledOutOf: t({
			en: insert("{{enabled}} enabled out of {{total}} {{repositories}}"),
			es: insert("{{enabled}} habilitados de {{total}} {{repositories}}"),
		}),
		repositories: enu({
			"0": t({
				en: "repositories",
				es: "repositorios",
			}),
			"1": t({
				en: "repository",
				es: "repositorio",
			}),
			fallback: t({
				en: "repositories",
				es: "repositorios",
			}),
		}),
		reposNeedAttentionCount: t({
			en: insert("{{count}} {{needAttention}}"),
			es: insert("{{count}} {{needAttention}}"),
		}),
		reposNeedAttention: enu({
			"0": t({
				en: "repos need attention",
				es: "repositorios necesitan atención",
			}),
			"1": t({
				en: "repo needs attention",
				es: "repositorio necesita atención",
			}),
			fallback: t({
				en: "repos need attention",
				es: "repositorios necesitan atención",
			}),
		}),
	},
} satisfies Dictionary;

export default integrationCardContent;
