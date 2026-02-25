import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/Popover";
import { useClient } from "../../contexts/ClientContext";
import { getLog } from "../../util/Logger";
import type { ArticleSiteInfo } from "jolli-common";
import { Globe, Lock } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

interface ArticleSitesBadgeProps {
	/** JRN of the article to show sites for */
	articleJrn: string;
}

/**
 * Compact badge showing which sites include this article.
 * Shows a Globe icon with site count. Click to see the full list in a popover.
 * Colors match the sidebar: grey globe for external, amber lock for internal.
 */
export function ArticleSitesBadge({ articleJrn }: ArticleSitesBadgeProps): ReactElement | null {
	const content = useIntlayer("article-sites-badge");
	const client = useClient();
	const [sites, setSites] = useState<Array<ArticleSiteInfo>>([]);

	const fetchSites = useCallback(async () => {
		setSites([]);
		try {
			const result = await client.sites().getSitesForArticle(articleJrn);
			setSites(result);
		} catch (error) {
			log.warn(error, "Failed to fetch sites for article %s", articleJrn);
		}
	}, [client, articleJrn]);

	useEffect(() => {
		fetchSites();
	}, [fetchSites]);

	if (sites.length === 0) {
		return null;
	}

	const externalSites = sites.filter(s => s.visibility === "external");
	const internalSites = sites.filter(s => s.visibility === "internal");

	function renderSiteRow(site: ArticleSiteInfo, Icon: typeof Globe, colorClass: string, label: string) {
		return (
			<div key={site.id} className="flex items-center gap-2 px-2 py-1 rounded text-sm hover:bg-muted/50">
				<Icon className={`h-3.5 w-3.5 ${colorClass} shrink-0`} />
				<span className="truncate flex-1">{site.displayName || site.name}</span>
				<span className={`text-[10px] ${colorClass} shrink-0`}>{label}</span>
			</div>
		);
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted shrink-0"
					aria-label={content.publishedSites.value}
					data-testid="article-sites-badge"
				>
					<Globe className="h-3.5 w-3.5" />
					<span>{sites.length}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-56 p-3" align="start" data-testid="article-sites-popover">
				<div className="text-xs font-medium text-muted-foreground mb-2">{content.publishedSites}</div>
				<div className="flex flex-col gap-0.5">
					{externalSites.map(site =>
						renderSiteRow(site, Globe, "text-muted-foreground", content.external.value),
					)}
					{internalSites.map(site => renderSiteRow(site, Lock, "text-amber-500", content.internal.value))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
