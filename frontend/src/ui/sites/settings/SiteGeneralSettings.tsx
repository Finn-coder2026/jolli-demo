import { toast } from "../../../components/ui/Sonner";
import { useClient } from "../../../contexts/ClientContext";
import { useNavigation } from "../../../contexts/NavigationContext";
import { useSites } from "../../../contexts/SitesContext";
import { getLog } from "../../../util/Logger";
import { copyToClipboard, getPrimarySiteDomain } from "../../../util/UrlUtil";
import { AuthSettingsSection } from "./AuthSettingsSection";
import { DangerZoneSection } from "./DangerZoneSection";
import { DomainSettingsSection } from "./DomainSettingsSection";
import { FolderStructureSection } from "./FolderStructureSection";
import { SiteInfoSection } from "./SiteInfoSection";
import type { JwtAuthMode, SiteWithUpdate } from "jolli-common";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

export function SiteGeneralSettings(): ReactElement {
	const content = useIntlayer("site-settings-tab");
	const client = useClient();
	const { navigate, siteSettingsSiteId } = useNavigation();
	const { sites, refreshSites } = useSites();

	const [showDomainManager, setShowDomainManager] = useState(false);
	const [copiedUrl, setCopiedUrl] = useState(false);
	const [savingJwtAuth, setSavingJwtAuth] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [savingFolderStructure, setSavingFolderStructure] = useState(false);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) {
				clearTimeout(copyTimeoutRef.current);
			}
		};
	}, []);

	const docsite = sites.find(s => s.id === siteSettingsSiteId);

	if (!docsite) {
		return (
			<div className="h-full flex items-center justify-center" data-testid="settings-fallback">
				<span className="text-muted-foreground">{content.title}</span>
			</div>
		);
	}

	const primaryUrl = getPrimarySiteDomain(docsite) ?? null;

	async function handleCopyUrl() {
		if (!primaryUrl) {
			return;
		}
		const success = await copyToClipboard(primaryUrl);
		if (success) {
			setCopiedUrl(true);
			if (copyTimeoutRef.current) {
				clearTimeout(copyTimeoutRef.current);
			}
			copyTimeoutRef.current = setTimeout(() => setCopiedUrl(false), 2000);
		}
	}

	async function handleJwtAuthUpdate(enabled: boolean, mode: JwtAuthMode) {
		if (!docsite) {
			return;
		}
		try {
			setSavingJwtAuth(true);
			await client.sites().updateJwtAuthConfig(docsite.id, { enabled, mode });
			await refreshSites();
		} catch (error) {
			log.error(error, "Failed to update JWT auth config");
			toast.error(content.authUpdateFailedMessage.value);
		} finally {
			setSavingJwtAuth(false);
		}
	}

	async function handleFolderStructureToggle() {
		if (!docsite) {
			return;
		}
		try {
			setSavingFolderStructure(true);
			const currentValue = docsite.metadata?.useSpaceFolderStructure ?? false;
			await client.sites().updateFolderStructure(docsite.id, !currentValue);
			await refreshSites();
		} catch (error) {
			log.error(error, "Failed to update folder structure setting");
			toast.error(content.folderStructureUpdateFailedMessage.value);
		} finally {
			setSavingFolderStructure(false);
		}
	}

	function handleDocsiteUpdate(_updatedSite: SiteWithUpdate) {
		refreshSites();
	}

	async function handleDelete() {
		if (!docsite) {
			return;
		}
		try {
			setDeleting(true);
			await client.sites().deleteSite(docsite.id);
			navigate("/sites");
		} catch (error) {
			log.error(error, "Failed to delete site");
			toast.error(content.deleteFailedMessage.value);
			setShowDeleteConfirm(false);
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div className="max-w-2xl mx-auto p-8 space-y-6">
			<SiteInfoSection
				docsite={docsite}
				primaryUrl={primaryUrl}
				copiedUrl={copiedUrl}
				onCopyUrl={handleCopyUrl}
			/>

			<AuthSettingsSection docsite={docsite} saving={savingJwtAuth} onUpdate={handleJwtAuthUpdate} />

			<FolderStructureSection
				docsite={docsite}
				saving={savingFolderStructure}
				onToggle={handleFolderStructureToggle}
			/>

			<DomainSettingsSection
				docsite={docsite}
				showManager={showDomainManager}
				onToggleManager={() => setShowDomainManager(!showDomainManager)}
				onDocsiteUpdate={handleDocsiteUpdate}
			/>

			<DangerZoneSection
				docsite={docsite}
				showConfirm={showDeleteConfirm}
				deleting={deleting}
				onShowConfirm={setShowDeleteConfirm}
				onDelete={handleDelete}
			/>
		</div>
	);
}
