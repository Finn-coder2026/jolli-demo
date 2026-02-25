import { SiteIcon } from "../../components/SiteIcon";
import { Button } from "../../components/ui/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu";
import { Skeleton } from "../../components/ui/Skeleton";
import { useNavigation } from "../../contexts/NavigationContext";
import { useSites } from "../../contexts/SitesContext";
import { SiteAuthIndicator } from "../unified-sidebar/SiteAuthIndicator";
import type { SiteWithUpdate } from "jolli-common";
import { Check, ChevronDown, Plus } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface SiteSwitcherProps {
	currentSite: SiteWithUpdate;
	onSiteChange: (site: SiteWithUpdate) => void;
	onOpenChange?: (open: boolean) => void;
}

export function SiteSwitcher({ currentSite, onSiteChange, onOpenChange }: SiteSwitcherProps): ReactElement {
	const content = useIntlayer("site-switcher");
	const { navigate } = useNavigation();
	const { sites, isLoading } = useSites();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);

	function handleDropdownOpenChange(open: boolean) {
		setIsDropdownOpen(open);
		onOpenChange?.(open);
	}

	function handleSelectSite(site: SiteWithUpdate) {
		if (site.id !== currentSite.id) {
			onSiteChange(site);
		}
		handleDropdownOpenChange(false);
	}

	function handleAddSiteClick() {
		handleDropdownOpenChange(false);
		// Navigate to the create site wizard
		navigate("/sites/new");
	}

	if (isLoading) {
		return (
			<div className="px-3 py-2">
				<Skeleton className="h-7 w-full" data-testid="site-switcher-loading" />
			</div>
		);
	}

	return (
		<div className="px-3 py-2 w-full min-w-0">
			<DropdownMenu open={isDropdownOpen} onOpenChange={handleDropdownOpenChange}>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						className="w-full justify-between h-auto py-1.5 px-2 font-semibold text-sm"
						data-testid="site-switcher-trigger"
					>
						<div className="flex items-center gap-2 truncate flex-1 min-w-0">
							<SiteIcon name={currentSite.displayName} size={5} />
							<span className="truncate">{currentSite.displayName}</span>
							<SiteAuthIndicator metadata={currentSite.metadata} iconClassName="h-3.5 w-3.5" />
						</div>
						<ChevronDown className="h-4 w-4 ml-1 shrink-0 opacity-50" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56" data-testid="site-switcher-content">
					{sites.map(site => (
						<DropdownMenuItem
							key={site.id}
							onClick={() => handleSelectSite(site)}
							className="flex items-center gap-2"
							data-testid={`site-option-${site.id}`}
						>
							<SiteIcon name={site.displayName} size={5} />
							<span className="truncate flex-1">{site.displayName}</span>
							<SiteAuthIndicator metadata={site.metadata} iconClassName="h-3.5 w-3.5" />
							{site.id === currentSite.id && <Check className="h-4 w-4 shrink-0" />}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={handleAddSiteClick} data-testid="add-site-option">
						<Plus className="h-4 w-4 mr-2" />
						{content.addSite}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
