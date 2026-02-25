import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { useClient } from "../../contexts/ClientContext";
import { getLog } from "../../util/Logger";
import { copyToClipboard } from "../../util/UrlUtil";
import type { CustomDomainInfo, SiteWithUpdate } from "jolli-common";
import { CheckCircle, Clock, Copy, Plus, RefreshCw, Trash2, XCircle } from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

// Exported for testing
export const DOMAIN_PATTERN = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
export const MAX_CUSTOM_DOMAINS = 1;
export const POLLING_INTERVAL_MS = 10000; // 10 seconds

export function validateDomain(domain: string): boolean {
	return DOMAIN_PATTERN.test(domain.toLowerCase());
}

/**
 * Get simplified DNS instruction for a domain (Mintlify-style).
 * - Subdomains (e.g., docs.example.com) -> CNAME to cname.vercel-dns.com
 * - Apex domains (e.g., example.com) -> A record to Vercel IP
 *
 * For nested subdomains like api.docs.example.com, the CNAME name should be
 * "api.docs" (everything before the base domain).
 */
export function getSimplifiedDnsInstruction(domain: string): { type: string; name: string; value: string } {
	const parts = domain.split(".");
	if (parts.length === 2) {
		// Apex domain - use A record
		return { type: "A", name: "@", value: "76.76.21.21" };
	}
	// Subdomain - use CNAME with all subdomain parts (everything except the last 2 parts)
	const subdomainParts = parts.slice(0, -2);
	return { type: "CNAME", name: subdomainParts.join("."), value: "cname.vercel-dns.com" };
}

/**
 * Simplify a DNS record name by removing the base domain suffix.
 * Most DNS providers auto-append the domain, so users only need to enter the prefix.
 *
 * Examples:
 * - "_vercel.aidancrosbie.com" with base "aidancrosbie.com" -> "_vercel"
 * - "_vercel.docs.example.com" with base "example.com" -> "_vercel.docs"
 * - "_vercel" (no base domain suffix) -> "_vercel" (unchanged)
 */
export function simplifyDnsRecordName(recordName: string, baseDomain: string): string {
	// Get the apex domain (last 2 parts) from the user's domain
	const baseParts = baseDomain.split(".");
	const apexDomain = baseParts.slice(-2).join(".");

	// If the record name ends with the apex domain, strip it
	if (recordName.endsWith(`.${apexDomain}`)) {
		return recordName.slice(0, -(apexDomain.length + 1));
	}

	// If it exactly matches the apex domain, return "@"
	if (recordName === apexDomain) {
		return "@";
	}

	return recordName;
}

interface CustomDomainManagerProps {
	site: SiteWithUpdate;
	onUpdate: (site: SiteWithUpdate) => void;
}

export function CustomDomainManager({ site, onUpdate }: CustomDomainManagerProps): ReactElement {
	const content = useIntlayer("custom-domain-manager");
	const client = useClient();
	const [isAddingDomain, setIsAddingDomain] = useState(false);
	const [newDomain, setNewDomain] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [verifyingDomain, setVerifyingDomain] = useState<string | undefined>();
	const [removingDomain, setRemovingDomain] = useState<string | undefined>();
	const [confirmingRemove, setConfirmingRemove] = useState<string | undefined>();
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [copiedValue, setCopiedValue] = useState<string | undefined>();
	const [isAutoChecking, setIsAutoChecking] = useState(false);

	const customDomains = site.metadata?.customDomains ?? [];
	const hasMaxDomains = customDomains.length >= MAX_CUSTOM_DOMAINS;
	const hasPendingDomains = customDomains.some(d => d.status === "pending");

	// Track refs to avoid stale closures in useEffect
	const siteIdRef = useRef(site.id);
	const onUpdateRef = useRef(onUpdate);
	siteIdRef.current = site.id;
	onUpdateRef.current = onUpdate;

	// Auto-poll for verification status when there are pending domains
	useEffect(() => {
		if (!hasPendingDomains) {
			return;
		}

		async function checkDomains() {
			setIsAutoChecking(true);
			try {
				await client.sites().refreshDomainStatuses(siteIdRef.current);
				const updatedSite = await client.sites().getSite(siteIdRef.current);
				if (updatedSite) {
					onUpdateRef.current(updatedSite);
				}
			} catch (err) {
				log.warn(err, "Auto-verification poll failed");
			} finally {
				setIsAutoChecking(false);
			}
		}

		const interval = setInterval(checkDomains, POLLING_INTERVAL_MS);
		return () => clearInterval(interval);
	}, [hasPendingDomains, client]);

	async function handleAddDomain() {
		const domain = newDomain.toLowerCase().trim();
		if (!validateDomain(domain)) {
			setError(content.invalidDomain.value);
			return;
		}

		setIsSubmitting(true);
		setError(undefined);

		try {
			await client.sites().addCustomDomain(site.id, domain);
			// Refresh site data
			const updatedSite = await client.sites().getSite(site.id);
			if (updatedSite) {
				onUpdateRef.current(updatedSite);
			}
			setIsAddingDomain(false);
			setNewDomain("");
		} catch (err) {
			log.error(err, "Failed to add custom domain");
			setError(err instanceof Error ? err.message : content.addFailed.value);
		} finally {
			setIsSubmitting(false);
		}
	}

	function handleRemoveClick(domain: string) {
		setConfirmingRemove(domain);
	}

	function handleCancelRemove() {
		setConfirmingRemove(undefined);
	}

	async function handleConfirmRemove() {
		if (!confirmingRemove) {
			return;
		}

		const domain = confirmingRemove;
		setConfirmingRemove(undefined);
		setRemovingDomain(domain);
		try {
			await client.sites().removeCustomDomain(site.id, domain);
			const updatedSite = await client.sites().getSite(site.id);
			if (updatedSite) {
				onUpdateRef.current(updatedSite);
			}
		} catch (err) {
			log.error(err, "Failed to remove custom domain");
			setError(err instanceof Error ? err.message : content.removeFailed.value);
		} finally {
			setRemovingDomain(undefined);
		}
	}

	async function handleVerifyDomain(domain: string) {
		setVerifyingDomain(domain);
		try {
			await client.sites().verifyCustomDomain(site.id, domain);
			const updatedSite = await client.sites().getSite(site.id);
			if (updatedSite) {
				onUpdateRef.current(updatedSite);
			}
		} catch (err) {
			log.error(err, "Failed to verify custom domain");
			setError(err instanceof Error ? err.message : content.verifyFailed.value);
		} finally {
			setVerifyingDomain(undefined);
		}
	}

	async function handleRefreshAll() {
		setIsRefreshing(true);
		try {
			await client.sites().refreshDomainStatuses(site.id);
			const updatedSite = await client.sites().getSite(site.id);
			if (updatedSite) {
				onUpdateRef.current(updatedSite);
			}
		} catch (err) {
			log.error(err, "Failed to refresh domain statuses");
			setError(err instanceof Error ? err.message : content.refreshFailed.value);
		} finally {
			setIsRefreshing(false);
		}
	}

	async function handleCopy(value: string) {
		const success = await copyToClipboard(value);
		if (success) {
			setCopiedValue(value);
			setTimeout(() => setCopiedValue(undefined), 2000);
		}
	}

	function handleNewDomainChange(e: React.ChangeEvent<HTMLInputElement>) {
		setNewDomain(e.target.value);
	}

	function handleCancelAdd() {
		setIsAddingDomain(false);
		setNewDomain("");
		setError(undefined);
	}

	function handleStartAdd() {
		setIsAddingDomain(true);
	}

	function getStatusIcon(status: string): ReactElement {
		switch (status) {
			case "verified":
				return <CheckCircle className="h-4 w-4 text-green-500" data-testid="status-verified" />;
			case "pending":
				return <Clock className="h-4 w-4 text-amber-500" data-testid="status-pending" />;
			case "failed":
				return <XCircle className="h-4 w-4 text-red-500" data-testid="status-failed" />;
			default:
				return <Clock className="h-4 w-4 text-muted-foreground" data-testid="status-unknown" />;
		}
	}

	function getStatusBadgeClass(status: string): string {
		switch (status) {
			case "verified":
				return "bg-green-500/10 text-green-600 dark:text-green-400";
			case "pending":
				return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
			case "failed":
				return "bg-red-500/10 text-red-600 dark:text-red-400";
			default:
				return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
		}
	}

	function getStatusLabel(status: string): ReactNode {
		switch (status) {
			case "verified":
				return content.verifiedStatus;
			case "pending":
				return content.pendingStatus;
			case "failed":
				return content.failedStatus;
			default:
				return status;
		}
	}

	/**
	 * Render a single DNS record row
	 */
	function renderDnsRecord(record: { type: string; name: string; value: string }, index: number): ReactElement {
		const testIdSuffix = index > 0 ? `-${index}` : "";
		return (
			<div
				key={`${record.type}-${record.name}-${index}`}
				className="bg-background/50 p-3 rounded border border-border/50"
				data-testid={`dns-record${testIdSuffix}`}
			>
				{/* Record Type - prominent at top */}
				<div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/30">
					<span className="text-xs text-muted-foreground">{content.recordType}:</span>
					<span className="text-sm font-bold text-foreground bg-muted px-2 py-0.5 rounded">
						{record.type}
					</span>
				</div>

				{/* Name/Host field */}
				<div className="mb-2">
					<div className="text-xs text-muted-foreground mb-1">{content.recordName}</div>
					<div className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1.5">
						<code className="text-xs font-mono flex-1 break-all">{record.name}</code>
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6 flex-shrink-0"
							onClick={() => handleCopy(record.name)}
							data-testid={`copy-name${testIdSuffix}`}
						>
							<Copy className={`h-3 w-3 ${copiedValue === record.name ? "text-green-500" : ""}`} />
						</Button>
					</div>
				</div>

				{/* Value/Points to field */}
				<div>
					<div className="text-xs text-muted-foreground mb-1">{content.recordValue}</div>
					<div className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1.5">
						<code className="text-xs font-mono flex-1 break-all">{record.value}</code>
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6 flex-shrink-0"
							onClick={() => handleCopy(record.value)}
							data-testid={`copy-value${testIdSuffix}`}
						>
							<Copy className={`h-3 w-3 ${copiedValue === record.value ? "text-green-500" : ""}`} />
						</Button>
					</div>
				</div>
			</div>
		);
	}

	function renderDnsInstructions(domainInfo: CustomDomainInfo): ReactElement | null {
		if (domainInfo.status !== "pending") {
			return null;
		}

		// Always show the primary DNS record (CNAME for subdomains, A for apex)
		const primaryRecord = getSimplifiedDnsInstruction(domainInfo.domain);

		// Only show TXT verification records if Vercel returned them
		const verificationRecords = domainInfo.verification?.filter(v => v.type === "TXT") ?? [];

		return (
			<div className="mt-3 space-y-4" data-testid="dns-instructions">
				{/* Step 1: Primary DNS record - always shown */}
				<div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg" data-testid="dns-step-1">
					<h4 className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">{content.step1Title}</h4>
					<p className="text-xs text-blue-600 dark:text-blue-300 mb-3">{content.step1Description}</p>
					{renderDnsRecord(primaryRecord, 0)}
				</div>

				{/* Step 2: TXT verification - only shown when Vercel returns it */}
				{verificationRecords.length > 0 ? (
					<div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg" data-testid="dns-step-2">
						<h4 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">
							{content.step2Title}
						</h4>
						<p className="text-xs text-amber-600 dark:text-amber-300 mb-3">{content.step2Description}</p>
						<div className="space-y-3">
							{verificationRecords.map((v, i) =>
								renderDnsRecord(
									{
										type: v.type,
										name: simplifyDnsRecordName(v.domain, domainInfo.domain),
										value: v.value,
									},
									i + 1,
								),
							)}
						</div>
					</div>
				) : (
					<p className="text-xs text-muted-foreground" data-testid="waiting-for-verification">
						{content.waitingForVerification}
					</p>
				)}
			</div>
		);
	}

	return (
		<div data-testid="custom-domain-manager">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-sm font-medium">{content.title}</h3>
				<div className="flex items-center gap-2">
					{customDomains.length > 0 && (
						<Button
							variant="ghost"
							size="sm"
							onClick={handleRefreshAll}
							disabled={isRefreshing}
							data-testid="refresh-all-button"
						>
							<RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
							{content.refreshAll}
						</Button>
					)}
					{!hasMaxDomains && !isAddingDomain && (
						<Button variant="outline" size="sm" onClick={handleStartAdd} data-testid="add-domain-button">
							<Plus className="h-4 w-4 mr-1" />
							{content.addDomain}
						</Button>
					)}
				</div>
			</div>

			{error && (
				<div
					className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-3 rounded mb-4 text-sm"
					data-testid="error-message"
				>
					{error}
				</div>
			)}

			{isAddingDomain && (
				<div className="border border-border rounded-lg p-4 mb-4" data-testid="add-domain-form">
					<h4 className="text-sm font-medium mb-2">{content.addDomainTitle}</h4>
					<p className="text-xs text-muted-foreground mb-3">{content.addDomainDescription}</p>
					<div className="flex items-center gap-2">
						<Input
							value={newDomain}
							onChange={handleNewDomainChange}
							placeholder={content.domainPlaceholder.value}
							disabled={isSubmitting}
							data-testid="new-domain-input"
						/>
						<Button
							onClick={handleAddDomain}
							disabled={isSubmitting || !newDomain.trim()}
							data-testid="confirm-add-button"
						>
							{isSubmitting ? content.adding : content.add}
						</Button>
						<Button
							variant="ghost"
							onClick={handleCancelAdd}
							disabled={isSubmitting}
							data-testid="cancel-add-button"
						>
							{content.cancel}
						</Button>
					</div>
				</div>
			)}

			{customDomains.length === 0 && !isAddingDomain && (
				<div className="text-sm text-muted-foreground" data-testid="no-domains">
					{content.noDomains}
				</div>
			)}

			{customDomains.map(domain => (
				<div key={domain.domain} className="border border-border rounded-lg p-4 mb-3" data-testid="domain-item">
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
						<div className="flex items-center gap-2 min-w-0">
							<span className="flex-shrink-0">{getStatusIcon(domain.status)}</span>
							<span className="font-medium truncate" data-testid="domain-name">
								{domain.domain}
							</span>
							<span
								className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${getStatusBadgeClass(domain.status)}`}
								data-testid="domain-status-badge"
							>
								{getStatusLabel(domain.status)}
							</span>
							{domain.status === "pending" && isAutoChecking && (
								<span
									className="text-xs text-muted-foreground flex items-center gap-1"
									data-testid="auto-checking-indicator"
								>
									<RefreshCw className="h-3 w-3 animate-spin" />
									{content.autoChecking}
								</span>
							)}
						</div>
						<div className="flex items-center gap-2 flex-shrink-0">
							{domain.status === "pending" && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => handleVerifyDomain(domain.domain)}
									disabled={verifyingDomain === domain.domain}
									data-testid={`verify-${domain.domain}`}
								>
									<RefreshCw
										className={`h-4 w-4 mr-1 ${verifyingDomain === domain.domain ? "animate-spin" : ""}`}
									/>
									{content.checkStatus}
								</Button>
							)}
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleRemoveClick(domain.domain)}
								disabled={removingDomain === domain.domain}
								data-testid={`remove-${domain.domain}`}
							>
								<Trash2 className="h-4 w-4 text-red-500" />
							</Button>
						</div>
					</div>

					{domain.lastCheckedAt && (
						<p className="text-xs text-muted-foreground mt-2" data-testid="last-checked">
							{content.lastChecked}: {new Date(domain.lastCheckedAt).toLocaleString()}
						</p>
					)}

					{domain.status === "failed" && domain.verificationError && (
						<p className="text-xs text-red-500 mt-2" data-testid="verification-error">
							{domain.verificationError}
						</p>
					)}

					{renderDnsInstructions(domain)}
				</div>
			))}

			{/* Confirmation dialog for removing domain */}
			{confirmingRemove && (
				<div
					className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
					data-testid="remove-confirm-dialog"
				>
					<div className="bg-background border border-border rounded-lg p-4 max-w-sm mx-4 shadow-lg">
						<p className="text-sm mb-4">{content.confirmRemove}</p>
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={handleCancelRemove}
								data-testid="cancel-remove"
							>
								{content.cancel}
							</Button>
							<Button
								variant="destructive"
								size="sm"
								onClick={handleConfirmRemove}
								data-testid="confirm-remove"
							>
								{content.remove}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
