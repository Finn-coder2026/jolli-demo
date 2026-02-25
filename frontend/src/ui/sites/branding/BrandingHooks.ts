/**
 * Custom hooks for managing branding state and operations.
 */
import type { useClient } from "../../../contexts/ClientContext";
import { getLog } from "../../../util/Logger";
import {
	BRANDING_LIMITS,
	type ExternalLink,
	type FooterColumn,
	type HeaderNavItem,
	type SiteBranding,
	type SiteWithUpdate,
	type SocialLinks,
} from "jolli-common";
import { useCallback, useMemo, useState } from "react";

const log = getLog(import.meta);

/**
 * Custom hook for managing branding state and operations
 */
export function useBrandingState(
	docsite: SiteWithUpdate,
	onDocsiteUpdate: (site: SiteWithUpdate) => void,
	client: ReturnType<typeof useClient>,
) {
	const initialBranding = docsite.metadata?.branding || {};
	const [branding, setBranding] = useState<SiteBranding>(initialBranding);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isDirty = useMemo(
		() => JSON.stringify(branding) !== JSON.stringify(initialBranding),
		[branding, initialBranding],
	);

	const updateField = useCallback(<K extends keyof SiteBranding>(field: K, value: SiteBranding[K]) => {
		setBranding(prev => ({ ...prev, [field]: value }));
		setError(null);
	}, []);

	const handleSave = useCallback(async () => {
		try {
			setSaving(true);
			setError(null);
			const updatedSite = await client.sites().updateBranding(docsite.id, branding);
			onDocsiteUpdate({ ...updatedSite, needsUpdate: true, brandingChanged: true } as SiteWithUpdate);
		} catch (err) {
			log.error(err, "Failed to save branding");
			setError(err instanceof Error ? err.message : "Failed to save branding");
		} finally {
			setSaving(false);
		}
	}, [client, docsite.id, branding, onDocsiteUpdate]);

	const handleReset = useCallback(() => {
		setBranding(initialBranding);
		setError(null);
	}, [initialBranding]);

	return { branding, setBranding, saving, error, setError, isDirty, updateField, handleSave, handleReset };
}

/**
 * Hook for header navigation item management
 */
export function useHeaderNavHandlers(
	branding: SiteBranding,
	updateField: <K extends keyof SiteBranding>(field: K, value: SiteBranding[K]) => void,
) {
	const addNavItem = useCallback(() => {
		const currentItems = branding.headerLinks?.items || [];
		// Defensive: UI hides add button at max, so this guard is a fallback
		/* c8 ignore next 3 */
		if (currentItems.length >= BRANDING_LIMITS.MAX_HEADER_ITEMS) {
			return;
		}
		const newItem: HeaderNavItem = { label: "", url: "" };
		updateField("headerLinks", { items: [...currentItems, newItem] });
	}, [branding.headerLinks?.items, updateField]);

	const updateNavItem = useCallback(
		(index: number, updates: Partial<HeaderNavItem>) => {
			const currentItems = branding.headerLinks?.items || [];
			const newItems = [...currentItems];
			newItems[index] = { ...newItems[index], ...updates };
			updateField("headerLinks", { items: newItems });
		},
		[branding.headerLinks?.items, updateField],
	);

	const removeNavItem = useCallback(
		(index: number) => {
			const currentItems = branding.headerLinks?.items || [];
			const newItems = currentItems.filter((_, i) => i !== index);
			updateField("headerLinks", { items: newItems });
		},
		[branding.headerLinks?.items, updateField],
	);

	const toggleNavItemType = useCallback(
		(index: number) => {
			const currentItems = branding.headerLinks?.items || [];
			const item = currentItems[index];
			// Defensive: UI only renders toggle button for existing items
			/* c8 ignore next 3 */
			if (!item) {
				return;
			}
			const newItems = [...currentItems];
			if (item.url !== undefined) {
				newItems[index] = { label: item.label, items: [] };
			} else {
				newItems[index] = { label: item.label, url: "" };
			}
			updateField("headerLinks", { items: newItems });
		},
		[branding.headerLinks?.items, updateField],
	);

	const addDropdownLink = useCallback(
		(navIndex: number) => {
			const currentItems = branding.headerLinks?.items || [];
			const item = currentItems[navIndex];
			// Defensive: UI only shows add button for valid dropdown items under limit
			/* c8 ignore next 3 */
			if (!item?.items || item.items.length >= BRANDING_LIMITS.MAX_DROPDOWN_ITEMS) {
				return;
			}
			const newItems = [...currentItems];
			newItems[navIndex] = { ...item, items: [...item.items, { label: "", url: "" }] };
			updateField("headerLinks", { items: newItems });
		},
		[branding.headerLinks?.items, updateField],
	);

	const updateDropdownLink = useCallback(
		(navIndex: number, linkIndex: number, field: keyof ExternalLink, value: string) => {
			const currentItems = branding.headerLinks?.items || [];
			const item = currentItems[navIndex];
			// Defensive: UI only renders inputs for existing dropdown items
			/* c8 ignore next 3 */
			if (!item?.items) {
				return;
			}
			const newLinks = [...item.items];
			newLinks[linkIndex] = { ...newLinks[linkIndex], [field]: value };
			const newItems = [...currentItems];
			newItems[navIndex] = { ...item, items: newLinks };
			updateField("headerLinks", { items: newItems });
		},
		[branding.headerLinks?.items, updateField],
	);

	const removeDropdownLink = useCallback(
		(navIndex: number, linkIndex: number) => {
			const currentItems = branding.headerLinks?.items || [];
			const item = currentItems[navIndex];
			// Defensive: UI only renders remove button for existing dropdown items
			/* c8 ignore next 3 */
			if (!item?.items) {
				return;
			}
			const newLinks = item.items.filter((_, i) => i !== linkIndex);
			const newItems = [...currentItems];
			newItems[navIndex] = { ...item, items: newLinks };
			updateField("headerLinks", { items: newItems });
		},
		[branding.headerLinks?.items, updateField],
	);

	return {
		addNavItem,
		updateNavItem,
		removeNavItem,
		toggleNavItemType,
		addDropdownLink,
		updateDropdownLink,
		removeDropdownLink,
	};
}

/**
 * Hook for footer management
 */
export function useFooterHandlers(
	branding: SiteBranding,
	updateField: <K extends keyof SiteBranding>(field: K, value: SiteBranding[K]) => void,
) {
	const addFooterColumn = useCallback(() => {
		const currentColumns = branding.footer?.columns || [];
		// Defensive: UI hides add button at max, so this guard is a fallback
		/* c8 ignore next 3 */
		if (currentColumns.length >= BRANDING_LIMITS.MAX_FOOTER_COLUMNS) {
			return;
		}
		const newColumns = [...currentColumns, { title: "", links: [] }];
		updateField("footer", { ...branding.footer, columns: newColumns });
	}, [branding.footer, updateField]);

	const updateFooterColumn = useCallback(
		(index: number, field: keyof FooterColumn, value: string | Array<ExternalLink>) => {
			const currentColumns = branding.footer?.columns || [];
			const newColumns = [...currentColumns];
			newColumns[index] = { ...newColumns[index], [field]: value };
			updateField("footer", { ...branding.footer, columns: newColumns });
		},
		[branding.footer, updateField],
	);

	const removeFooterColumn = useCallback(
		(index: number) => {
			const currentColumns = branding.footer?.columns || [];
			const newColumns = currentColumns.filter((_, i) => i !== index);
			updateField("footer", { ...branding.footer, columns: newColumns });
		},
		[branding.footer, updateField],
	);

	const addFooterColumnLink = useCallback(
		(columnIndex: number) => {
			const currentColumns = branding.footer?.columns || [];
			const column = currentColumns[columnIndex];
			// Defensive: UI only renders add link button for existing columns
			/* c8 ignore next 3 */
			if (!column) {
				return;
			}
			const newLinks = [...column.links, { label: "", url: "" }];
			const newColumns = [...currentColumns];
			newColumns[columnIndex] = { ...column, links: newLinks };
			updateField("footer", { ...branding.footer, columns: newColumns });
		},
		[branding.footer, updateField],
	);

	const updateFooterColumnLink = useCallback(
		(columnIndex: number, linkIndex: number, field: keyof ExternalLink, value: string) => {
			const currentColumns = branding.footer?.columns || [];
			const column = currentColumns[columnIndex];
			// Defensive: UI only renders inputs for existing columns
			/* c8 ignore next 3 */
			if (!column) {
				return;
			}
			const newLinks = [...column.links];
			newLinks[linkIndex] = { ...newLinks[linkIndex], [field]: value };
			const newColumns = [...currentColumns];
			newColumns[columnIndex] = { ...column, links: newLinks };
			updateField("footer", { ...branding.footer, columns: newColumns });
		},
		[branding.footer, updateField],
	);

	const removeFooterColumnLink = useCallback(
		(columnIndex: number, linkIndex: number) => {
			const currentColumns = branding.footer?.columns || [];
			const column = currentColumns[columnIndex];
			// Defensive: UI only renders remove button for existing columns
			/* c8 ignore next 3 */
			if (!column) {
				return;
			}
			const newLinks = column.links.filter((_, i) => i !== linkIndex);
			const newColumns = [...currentColumns];
			newColumns[columnIndex] = { ...column, links: newLinks };
			updateField("footer", { ...branding.footer, columns: newColumns });
		},
		[branding.footer, updateField],
	);

	const updateSocialLink = useCallback(
		(platform: keyof SocialLinks, value: string) => {
			const currentSocialLinks = branding.footer?.socialLinks || {};
			const newSocialLinks: SocialLinks = { ...currentSocialLinks };
			if (value) {
				newSocialLinks[platform] = value;
			} else {
				delete newSocialLinks[platform];
			}
			const hasSocialLinks = Object.keys(newSocialLinks).length > 0;
			const footerUpdate = { ...branding.footer };
			if (hasSocialLinks) {
				footerUpdate.socialLinks = newSocialLinks;
			} else {
				delete footerUpdate.socialLinks;
			}
			updateField("footer", footerUpdate);
		},
		[branding.footer, updateField],
	);

	return {
		addFooterColumn,
		updateFooterColumn,
		removeFooterColumn,
		addFooterColumnLink,
		updateFooterColumnLink,
		removeFooterColumnLink,
		updateSocialLink,
	};
}
