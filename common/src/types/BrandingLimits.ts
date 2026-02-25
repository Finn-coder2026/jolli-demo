/**
 * Shared limits for site branding validation.
 * Used by both frontend (input constraints) and backend (validation).
 */
export const BRANDING_LIMITS = {
	MAX_HEADER_ITEMS: 6,
	MAX_DROPDOWN_ITEMS: 8,
	MAX_FOOTER_COLUMNS: 4,
	MAX_FOOTER_LINKS_PER_COLUMN: 10,
	MAX_LABEL_LENGTH: 100,
	MAX_LOGO_LENGTH: 50,
	MAX_TOC_TITLE_LENGTH: 50,
	MAX_COPYRIGHT_LENGTH: 200,
	MAX_COLUMN_TITLE_LENGTH: 100,
	MIN_PRIMARY_HUE: 0,
	MAX_PRIMARY_HUE: 360,
	MIN_COLLAPSE_LEVEL: 1,
	MAX_COLLAPSE_LEVEL: 6,
} as const;

export type BrandingLimits = typeof BRANDING_LIMITS;
