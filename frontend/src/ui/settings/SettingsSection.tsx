/**
 * SettingsSection - A reusable section component for the Settings page.
 *
 * Groups related settings with a title and optional description.
 */

import type { ReactElement, ReactNode } from "react";

export interface SettingsSectionProps {
	/** Section title */
	title: string;
	/** Optional description text */
	description?: string;
	/** Settings controls to display in this section */
	children: ReactNode;
}

/**
 * A section wrapper for grouping related settings.
 */
export function SettingsSection({ title, description, children }: SettingsSectionProps): ReactElement {
	return (
		<div className="border-b border-border pb-6 last:border-b-0 last:pb-0">
			<h2 className="text-lg font-medium mb-1">{title}</h2>
			{description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
			<div className="space-y-4">{children}</div>
		</div>
	);
}

export interface SettingsRowProps {
	/** Label for the setting */
	label: string;
	/** Optional description of what this setting does */
	description?: string;
	/** The control component (toggle, select, etc.) */
	children: ReactNode;
}

/**
 * A single row in a settings section with label and control.
 */
export function SettingsRow({ label, description, children }: SettingsRowProps): ReactElement {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="flex-1">
				<div className="font-medium text-sm">{label}</div>
				{description && <div className="text-sm text-muted-foreground">{description}</div>}
			</div>
			<div className="flex-shrink-0">{children}</div>
		</div>
	);
}
