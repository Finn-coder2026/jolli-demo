import { Button } from "../../../../components/ui/Button";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface GitHubWelcomeBannerProps {
	repoCount: number;
	onDismiss: () => void;
}

export function GitHubWelcomeBanner({ repoCount, onDismiss }: GitHubWelcomeBannerProps): ReactElement {
	const content = useIntlayer("github-welcome-banner");
	return (
		<div className="mb-6 rounded-md bg-primary/10 border border-primary/20 p-4">
			<h3 className="font-semibold text-primary mb-2">{content.title}</h3>
			<p className="text-sm text-muted-foreground">
				{repoCount === 1 ? content.messageSingular : content.messagePlural}
			</p>
			<Button variant="ghost" size="sm" className="mt-2" onClick={onDismiss}>
				{content.dismiss}
			</Button>
		</div>
	);
}
