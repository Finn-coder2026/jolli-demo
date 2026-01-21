import { Input } from "../../components/ui/Input";
import { useClient } from "../../contexts/ClientContext";
import { getLog } from "../../util/Logger";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

// Exported for testing
// Must start/end with alphanumeric, no consecutive hyphens allowed
export const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9]*(-[a-z0-9]+)*)?$/;
export const MIN_SUBDOMAIN_LENGTH = 3;
export const MAX_SUBDOMAIN_LENGTH = 63;
export const DEBOUNCE_MS = 500;

/**
 * Generates a subdomain from a site name by converting to lowercase,
 * replacing invalid characters with hyphens, and cleaning up.
 * Exported for testing.
 */
export function generateSubdomainFromName(siteName: string): string {
	return siteName
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, MAX_SUBDOMAIN_LENGTH);
}

/**
 * Validates a subdomain for format, length, and pattern requirements.
 * Exported for testing.
 */
export function validateSubdomain(subdomain: string): { valid: boolean; error?: string } {
	if (subdomain.length < MIN_SUBDOMAIN_LENGTH) {
		return { valid: false, error: "tooShort" };
	}
	if (subdomain.length > MAX_SUBDOMAIN_LENGTH) {
		return { valid: false, error: "tooLong" };
	}
	if (/--/.test(subdomain)) {
		return { valid: false, error: "consecutiveHyphens" };
	}
	if (!SUBDOMAIN_PATTERN.test(subdomain)) {
		return { valid: false, error: "invalidFormat" };
	}
	return { valid: true };
}

type CheckStatus = "idle" | "checking" | "available" | "taken" | "error" | "invalid" | "invalidChars";

interface SubdomainInputProps {
	value: string;
	onChange: (value: string) => void;
	siteName: string;
	disabled?: boolean;
	domainSuffix?: string;
}

export function SubdomainInput({
	value,
	onChange,
	siteName,
	disabled = false,
	domainSuffix = ".jolli.site",
}: SubdomainInputProps): ReactElement {
	const content = useIntlayer("subdomain-input");
	const client = useClient();
	const [status, setStatus] = useState<CheckStatus>("idle");
	const [suggestion, setSuggestion] = useState<string | undefined>();
	const [errorMessage, setErrorMessage] = useState<string | undefined>();
	const [hasUserEdited, setHasUserEdited] = useState(false);
	// Store raw input including invalid characters for display
	const [displayValue, setDisplayValue] = useState(value);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const currentCheckRef = useRef<string | undefined>(undefined);

	// Sync displayValue with value prop when it changes externally (e.g., from auto-generation)
	useEffect(() => {
		if (!hasUserEdited) {
			setDisplayValue(value);
		}
	}, [value, hasUserEdited]);

	// Auto-generate from site name if user hasn't manually edited
	useEffect(() => {
		if (!hasUserEdited && siteName) {
			const generated = generateSubdomainFromName(siteName);
			if (generated !== value) {
				onChange(generated);
			}
		}
	}, [siteName, hasUserEdited, onChange, value]);

	// Check availability with debounce
	const checkAvailability = useCallback(
		async (subdomain: string) => {
			// Track which subdomain we're checking to ignore stale responses
			currentCheckRef.current = subdomain;

			// Validate locally first
			const validation = validateSubdomain(subdomain);
			if (!validation.valid) {
				setStatus("invalid");
				setErrorMessage(validation.error);
				setSuggestion(undefined);
				return;
			}

			setStatus("checking");
			setErrorMessage(undefined);
			setSuggestion(undefined);

			try {
				const result = await client.sites().checkSubdomainAvailability(subdomain);
				// Ignore stale response if user has typed something else
				if (currentCheckRef.current !== subdomain) {
					return;
				}
				if (result.available) {
					setStatus("available");
				} else {
					setStatus("taken");
					if (result.suggestion) {
						setSuggestion(result.suggestion);
					}
				}
				if (result.error) {
					setErrorMessage(result.error);
				}
			} catch (error) {
				// Ignore stale errors
				if (currentCheckRef.current !== subdomain) {
					return;
				}
				log.error(error, "Failed to check subdomain availability");
				setStatus("error");
				setErrorMessage("checkFailed");
			}
		},
		[client],
	);

	// Debounced check
	useEffect(() => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}

		// Don't check availability if value is too short or has invalid characters
		// The error state for these cases is managed by handleInputChange
		if (!value || value.length < MIN_SUBDOMAIN_LENGTH) {
			return;
		}
		// Skip availability check if there are invalid characters or consecutive hyphens
		if (!/^[a-z0-9-]*$/.test(value) || /--/.test(value)) {
			return;
		}

		debounceRef.current = setTimeout(() => {
			checkAvailability(value);
		}, DEBOUNCE_MS);

		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, [value, checkAvailability]);

	function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
		setHasUserEdited(true);
		const rawValue = e.target.value;
		// Only apply lowercase and length limit, don't strip characters
		const normalized = rawValue.toLowerCase().slice(0, MAX_SUBDOMAIN_LENGTH);

		setDisplayValue(normalized);

		// Check if there are invalid characters
		const hasInvalidChars = !/^[a-z0-9-]*$/.test(normalized);
		// Check for consecutive hyphens
		const hasConsecutiveHyphens = /--/.test(normalized);
		if (hasInvalidChars) {
			setStatus("invalidChars");
			setErrorMessage("invalidCharacters");
			setSuggestion(undefined);
		} else if (hasConsecutiveHyphens) {
			setStatus("invalid");
			setErrorMessage("consecutiveHyphens");
			setSuggestion(undefined);
		} else if (normalized.length > 0 && normalized.length < MIN_SUBDOMAIN_LENGTH) {
			// Show error for too short subdomain
			setStatus("invalid");
			setErrorMessage("tooShort");
			setSuggestion(undefined);
		} else {
			// Clear error if input is now valid or empty
			if (status === "invalidChars" || status === "invalid") {
				setStatus("idle");
				setErrorMessage(undefined);
			}
		}

		// Pass the normalized value (not sanitized) to parent
		onChange(normalized);
	}

	function handleSuggestionClick() {
		if (suggestion) {
			onChange(suggestion);
			setDisplayValue(suggestion);
			setSuggestion(undefined);
			setStatus("idle");
		}
	}

	function getStatusIcon(): ReactElement | null {
		switch (status) {
			case "checking":
				return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" data-testid="status-checking" />;
			case "available":
				return <CheckCircle className="h-4 w-4 text-green-500" data-testid="status-available" />;
			case "taken":
			case "error":
			case "invalid":
			case "invalidChars":
				return <XCircle className="h-4 w-4 text-red-500" data-testid="status-unavailable" />;
			default:
				return null;
		}
	}

	function getStatusMessage(): string | undefined {
		switch (status) {
			case "checking":
				return content.checking.value;
			case "available":
				return content.available.value;
			case "taken":
				return content.taken.value;
			case "error":
				return errorMessage === "checkFailed" ? content.checkFailed.value : errorMessage;
			case "invalidChars":
				return content.invalidCharacters.value;
			case "invalid":
				if (errorMessage === "tooShort") {
					return content.tooShort.value;
				}
				if (errorMessage === "tooLong") {
					return content.tooLong.value;
				}
				if (errorMessage === "invalidFormat") {
					return content.invalidFormat.value;
				}
				if (errorMessage === "consecutiveHyphens") {
					return content.consecutiveHyphens.value;
				}
				return;
			default:
				return;
		}
	}

	const statusMessage = getStatusMessage();
	const isError = status === "taken" || status === "error" || status === "invalid" || status === "invalidChars";

	return (
		<div data-testid="subdomain-input">
			<label className="block text-sm font-medium mb-1">{content.label}</label>
			<div className="flex items-center gap-2">
				<div className="relative flex-1">
					<Input
						value={displayValue}
						onChange={handleInputChange}
						placeholder={String(content.placeholder.value)}
						disabled={disabled}
						className={isError ? "border-red-500" : ""}
						data-testid="subdomain-input-field"
					/>
					<div className="absolute right-3 top-1/2 -translate-y-1/2">{getStatusIcon()}</div>
				</div>
				<span className="text-sm text-muted-foreground whitespace-nowrap" data-testid="domain-suffix">
					{domainSuffix}
				</span>
			</div>
			{statusMessage && (
				<p
					className={`text-xs mt-1 ${isError ? "text-red-500" : "text-muted-foreground"}`}
					data-testid="status-message"
				>
					{statusMessage}
				</p>
			)}
			{suggestion && (
				<button
					type="button"
					onClick={handleSuggestionClick}
					className="text-xs text-blue-500 hover:underline mt-1"
					data-testid="suggestion-button"
				>
					{content.trySuggestion}: {suggestion}
					{domainSuffix}
				</button>
			)}
			<p className="text-xs text-muted-foreground mt-1">{content.help}</p>
		</div>
	);
}
