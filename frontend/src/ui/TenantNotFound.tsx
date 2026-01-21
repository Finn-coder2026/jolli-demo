import styles from "./TenantNotFound.module.css";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export type TenantNotFoundError = "not_found" | "inactive" | undefined;

interface TenantNotFoundProps {
	error?: TenantNotFoundError;
}

/**
 * 404 page shown when a user visits an invalid tenant subdomain or custom domain.
 * Displayed before the main app loads when TenantMiddleware returns 404 or 403.
 */
export function TenantNotFound({ error }: TenantNotFoundProps): ReactElement {
	const content = useIntlayer("tenant-not-found");

	const getMessage = (): string => {
		switch (error) {
			case "not_found":
				return content.notFoundMessage as string;
			case "inactive":
				return content.inactiveMessage as string;
			default:
				return content.genericMessage as string;
		}
	};

	// Get the base URL to redirect to (strip subdomain from current host)
	const getMainSiteUrl = (): string => {
		const hostname = window.location.hostname;
		const parts = hostname.split(".");

		// If there are more than 2 parts (e.g., tenant.jolli.app), remove the first part
		if (parts.length > 2) {
			const mainDomain = parts.slice(1).join(".");
			return `${window.location.protocol}//${mainDomain}`;
		}

		// Otherwise, just return the current origin without the subdomain
		return window.location.origin;
	};

	return (
		<div className={styles.container}>
			<h1 className={styles.title}>{content.title}</h1>
			<p className={styles.message}>{getMessage()}</p>
			<a href={getMainSiteUrl()} className={styles.link}>
				{content.goToMain}
			</a>
			{error && <p className={styles.errorCode}>Error: {error}</p>}
		</div>
	);
}
