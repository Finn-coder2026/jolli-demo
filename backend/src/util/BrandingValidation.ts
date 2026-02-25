import {
	BRANDING_LIMITS,
	type ExternalLink,
	type FooterColumn,
	type HeaderNavItem,
	type SiteBranding,
	type SocialLinks,
} from "jolli-common";

/**
 * Validation result for site branding
 */
export interface BrandingValidationResult {
	isValid: boolean;
	errors: Array<string>;
}

/** Local alias for cleaner code */
const LIMITS = BRANDING_LIMITS;

/**
 * Valid enum values for branding fields
 */
const VALID_VALUES = {
	themePreset: ["minimal", "vibrant", "terminal", "friendly", "noir", "custom"],
	defaultTheme: ["dark", "light", "system"],
	fontFamily: ["inter", "space-grotesk", "ibm-plex", "source-sans"],
	codeTheme: ["github", "dracula", "one-dark", "nord"],
	borderRadius: ["sharp", "subtle", "rounded", "pill"],
	spacingDensity: ["compact", "comfortable", "airy"],
	navigationMode: ["sidebar", "tabs"],
	logoDisplay: ["text", "image", "both"],
	pageWidth: ["compact", "standard", "wide"],
	contentWidth: ["compact", "standard", "wide"],
	sidebarWidth: ["compact", "standard", "wide"],
	tocWidth: ["compact", "standard", "wide"],
	headerAlignment: ["left", "right"],
};

/**
 * Validates a URL is properly formatted with http/https protocol.
 */
function isValidUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Validates an optional URL field.
 */
function validateOptionalUrl(url: string | undefined, fieldName: string, errors: Array<string>): void {
	if (url !== undefined && url !== "" && !isValidUrl(url)) {
		errors.push(`${fieldName} must be a valid http/https URL`);
	}
}

/**
 * Validates string length.
 */
function validateStringLength(
	value: string | undefined,
	fieldName: string,
	maxLength: number,
	errors: Array<string>,
): void {
	if (value !== undefined && value.length > maxLength) {
		errors.push(`${fieldName} exceeds maximum length of ${maxLength} characters`);
	}
}

/**
 * Validates an enum value.
 */
function validateEnumValue(
	value: string | undefined,
	fieldName: string,
	validValues: Array<string>,
	errors: Array<string>,
): void {
	if (value !== undefined && !validValues.includes(value)) {
		errors.push(`${fieldName} must be one of: ${validValues.join(", ")}`);
	}
}

/**
 * Validates an external link object.
 */
function validateExternalLink(link: ExternalLink, context: string, errors: Array<string>): void {
	if (!link.label || typeof link.label !== "string") {
		errors.push(`${context}: link label is required`);
	} else {
		validateStringLength(link.label, `${context} label`, LIMITS.MAX_LABEL_LENGTH, errors);
	}

	if (!link.url || typeof link.url !== "string") {
		errors.push(`${context}: link URL is required`);
	} else {
		validateOptionalUrl(link.url, `${context} URL`, errors);
	}
}

/**
 * Validates header navigation items.
 */
function validateHeaderLinks(headerLinks: SiteBranding["headerLinks"], errors: Array<string>): void {
	if (!headerLinks?.items) {
		return;
	}

	if (!Array.isArray(headerLinks.items)) {
		errors.push("headerLinks.items must be an array");
		return;
	}

	if (headerLinks.items.length > LIMITS.MAX_HEADER_ITEMS) {
		errors.push(`headerLinks.items exceeds maximum of ${LIMITS.MAX_HEADER_ITEMS} items`);
	}

	headerLinks.items.forEach((item: HeaderNavItem, index: number) => {
		const ctx = `headerLinks.items[${index}]`;

		if (!item.label || typeof item.label !== "string") {
			errors.push(`${ctx}: label is required`);
		} else {
			validateStringLength(item.label, `${ctx}.label`, LIMITS.MAX_LABEL_LENGTH, errors);
		}

		// Either url or items, not both
		if (item.url && item.items) {
			errors.push(`${ctx}: cannot have both url and items (use one or the other)`);
		}

		if (item.url) {
			validateOptionalUrl(item.url, `${ctx}.url`, errors);
		}

		if (item.items) {
			if (!Array.isArray(item.items)) {
				errors.push(`${ctx}.items must be an array`);
			} else {
				if (item.items.length > LIMITS.MAX_DROPDOWN_ITEMS) {
					errors.push(`${ctx}.items exceeds maximum of ${LIMITS.MAX_DROPDOWN_ITEMS} dropdown items`);
				}
				item.items.forEach((subItem: ExternalLink, subIndex: number) => {
					validateExternalLink(subItem, `${ctx}.items[${subIndex}]`, errors);
				});
			}
		}
	});
}

/**
 * Validates social links.
 */
function validateSocialLinks(socialLinks: SocialLinks | undefined, errors: Array<string>): void {
	if (!socialLinks) {
		return;
	}

	const fields = ["github", "twitter", "discord", "linkedin", "youtube"] as const;
	for (const field of fields) {
		const url = socialLinks[field];
		if (url !== undefined && url !== "") {
			validateOptionalUrl(url, `footer.socialLinks.${field}`, errors);
		}
	}
}

/**
 * Validates footer configuration.
 */
function validateFooter(footer: SiteBranding["footer"], errors: Array<string>): void {
	if (!footer) {
		return;
	}

	validateStringLength(footer.copyright, "footer.copyright", LIMITS.MAX_COPYRIGHT_LENGTH, errors);

	if (footer.columns) {
		if (!Array.isArray(footer.columns)) {
			errors.push("footer.columns must be an array");
		} else {
			if (footer.columns.length > LIMITS.MAX_FOOTER_COLUMNS) {
				errors.push(`footer.columns exceeds maximum of ${LIMITS.MAX_FOOTER_COLUMNS} columns`);
			}

			footer.columns.forEach((column: FooterColumn, index: number) => {
				const ctx = `footer.columns[${index}]`;

				if (!column.title || typeof column.title !== "string") {
					errors.push(`${ctx}: title is required`);
				} else {
					validateStringLength(column.title, `${ctx}.title`, LIMITS.MAX_COLUMN_TITLE_LENGTH, errors);
				}

				if (!Array.isArray(column.links)) {
					errors.push(`${ctx}.links must be an array`);
				} else {
					if (column.links.length > LIMITS.MAX_FOOTER_LINKS_PER_COLUMN) {
						errors.push(`${ctx}.links exceeds maximum of ${LIMITS.MAX_FOOTER_LINKS_PER_COLUMN} links`);
					}
					column.links.forEach((link: ExternalLink, linkIndex: number) => {
						validateExternalLink(link, `${ctx}.links[${linkIndex}]`, errors);
					});
				}
			});
		}
	}

	validateSocialLinks(footer.socialLinks, errors);
}

/**
 * Validates a SiteBranding object.
 *
 * @param branding - The branding object to validate
 * @returns Validation result with isValid flag and error messages
 */
export function validateSiteBranding(branding: unknown): BrandingValidationResult {
	const errors: Array<string> = [];

	// Type guard - must be an object
	if (!branding || typeof branding !== "object") {
		return { isValid: false, errors: ["Branding must be an object"] };
	}

	const b = branding as SiteBranding;

	// Logo fields
	validateStringLength(b.logo, "logo", LIMITS.MAX_LOGO_LENGTH, errors);
	validateOptionalUrl(b.logoUrl, "logoUrl", errors);
	validateOptionalUrl(b.favicon, "favicon", errors);

	// Primary hue - must be 0-360
	if (b.primaryHue !== undefined) {
		if (typeof b.primaryHue !== "number" || Number.isNaN(b.primaryHue)) {
			errors.push("primaryHue must be a number");
		} else if (b.primaryHue < LIMITS.MIN_PRIMARY_HUE || b.primaryHue > LIMITS.MAX_PRIMARY_HUE) {
			errors.push(`primaryHue must be between ${LIMITS.MIN_PRIMARY_HUE} and ${LIMITS.MAX_PRIMARY_HUE}`);
		}
	}

	// Collapse level - must be 1-6
	if (b.sidebarDefaultCollapseLevel !== undefined) {
		if (typeof b.sidebarDefaultCollapseLevel !== "number" || Number.isNaN(b.sidebarDefaultCollapseLevel)) {
			errors.push("sidebarDefaultCollapseLevel must be a number");
		} else if (
			b.sidebarDefaultCollapseLevel < LIMITS.MIN_COLLAPSE_LEVEL ||
			b.sidebarDefaultCollapseLevel > LIMITS.MAX_COLLAPSE_LEVEL
		) {
			errors.push(
				`sidebarDefaultCollapseLevel must be between ${LIMITS.MIN_COLLAPSE_LEVEL} and ${LIMITS.MAX_COLLAPSE_LEVEL}`,
			);
		}
	}

	// TOC title
	validateStringLength(b.tocTitle, "tocTitle", LIMITS.MAX_TOC_TITLE_LENGTH, errors);

	// Enum validations
	validateEnumValue(b.themePreset, "themePreset", VALID_VALUES.themePreset, errors);
	validateEnumValue(b.defaultTheme, "defaultTheme", VALID_VALUES.defaultTheme, errors);
	validateEnumValue(b.fontFamily, "fontFamily", VALID_VALUES.fontFamily, errors);
	validateEnumValue(b.codeTheme, "codeTheme", VALID_VALUES.codeTheme, errors);
	validateEnumValue(b.borderRadius, "borderRadius", VALID_VALUES.borderRadius, errors);
	validateEnumValue(b.spacingDensity, "spacingDensity", VALID_VALUES.spacingDensity, errors);
	validateEnumValue(b.navigationMode, "navigationMode", VALID_VALUES.navigationMode, errors);
	validateEnumValue(b.logoDisplay, "logoDisplay", VALID_VALUES.logoDisplay, errors);
	validateEnumValue(b.pageWidth, "pageWidth", VALID_VALUES.pageWidth, errors);
	validateEnumValue(b.contentWidth, "contentWidth", VALID_VALUES.contentWidth, errors);
	validateEnumValue(b.sidebarWidth, "sidebarWidth", VALID_VALUES.sidebarWidth, errors);
	validateEnumValue(b.tocWidth, "tocWidth", VALID_VALUES.tocWidth, errors);
	validateEnumValue(b.headerAlignment, "headerAlignment", VALID_VALUES.headerAlignment, errors);

	// Boolean validation for hideToc
	if (b.hideToc !== undefined && typeof b.hideToc !== "boolean") {
		errors.push("hideToc must be a boolean");
	}

	// Complex nested validations
	validateHeaderLinks(b.headerLinks, errors);
	validateFooter(b.footer, errors);

	return {
		isValid: errors.length === 0,
		errors,
	};
}
