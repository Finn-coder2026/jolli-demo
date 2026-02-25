import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Search, X } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

const DEBOUNCE_MS = 500;

export interface SpaceSearchProps {
	onSearch: (query: string) => void;
	onClear: () => void;
	loading?: boolean;
}

export function SpaceSearch({ onSearch, onClear, loading = false }: SpaceSearchProps): ReactElement {
	const content = useIntlayer("space-search");
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	// Debounced search callback
	const debouncedSearch = useCallback(
		(searchQuery: string) => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
			debounceRef.current = setTimeout(() => {
				onSearch(searchQuery);
			}, DEBOUNCE_MS);
		},
		[onSearch],
	);

	// Handle input change with debounce
	function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
		const newQuery = e.target.value;
		setQuery(newQuery);
		debouncedSearch(newQuery);
	}

	// Clear search
	const handleClear = useCallback(() => {
		setQuery("");
		onClear();
		inputRef.current?.focus();
	}, [onClear]);

	// ESC key clears search
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape" && query) {
				handleClear();
				inputRef.current?.blur();
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [query, handleClear]);

	// Cleanup debounce on unmount
	useEffect(() => {
		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, []);

	return (
		<div className="px-4 pt-4 pb-3" data-testid="space-search">
			<div className="relative">
				<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					ref={inputRef}
					placeholder={String(content.placeholder.value)}
					value={query}
					onChange={handleInputChange}
					className="pl-9 h-9 pr-8 bg-sidebar-accent border-sidebar-border text-sm"
					disabled={loading}
					data-testid="space-search-input"
				/>
				{query && (
					<Button
						variant="ghost"
						size="icon"
						className="absolute right-1 top-1 h-7 w-7"
						onClick={handleClear}
						title={String(content.clearSearch.value)}
						data-testid="space-search-clear"
					>
						<X className="h-4 w-4" />
					</Button>
				)}
			</div>
		</div>
	);
}
