import { cn } from "../../common/ClassNameUtils";
import { cva, type VariantProps } from "class-variance-authority";
import { Inbox, Loader2 } from "lucide-react";
import { type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

const infiniteScrollVariants = cva("relative overflow-auto scrollbar-thin", {
	variants: {
		padding: {
			none: "",
			sm: "p-2",
			md: "p-4",
			lg: "p-6",
		},
		rounded: {
			none: "",
			sm: "rounded-sm",
			md: "rounded-md",
			lg: "rounded-lg",
		},
		border: {
			none: "",
			default: "border border-border",
			muted: "border border-muted",
		},
	},
	defaultVariants: {
		padding: "none",
		rounded: "none",
		border: "none",
	},
});

export type ThresholdPreset = "10" | "20" | "30";

export interface FetchResult<T> {
	list: Array<T>;
	total: number;
}

export interface InfiniteScrollProps<T> extends VariantProps<typeof infiniteScrollVariants> {
	/**
	 * Function to fetch data. Receives pageNo and pageSize, returns list and total.
	 */
	fetchData: (pageNo: number, pageSize: number) => Promise<FetchResult<T>>;
	/**
	 * Number of items to fetch per page.
	 */
	pageSize?: number;
	/**
	 * Threshold for triggering load more (percentage from bottom).
	 * "10" = 10%, "20" = 20%, "30" = 30%
	 */
	threshold?: ThresholdPreset;
	/**
	 * Render function for each item.
	 */
	renderItem: (item: T, index: number) => ReactNode;
	/**
	 * Optional key extractor for list items.
	 */
	keyExtractor?: (item: T, index: number) => string | number;
	/**
	 * Additional className for the container.
	 */
	className?: string;
	/**
	 * Test ID for the container.
	 */
	testId?: string;
}

const thresholdMap: Record<ThresholdPreset, number> = {
	"10": 0.1,
	"20": 0.2,
	"30": 0.3,
};

export function InfiniteScroll<T>({
	fetchData,
	pageSize = 20,
	threshold = "20",
	renderItem,
	keyExtractor,
	className,
	padding,
	rounded,
	border,
	testId,
}: InfiniteScrollProps<T>): ReactElement {
	const content = useIntlayer("infinite-scroll");
	const containerRef = useRef<HTMLDivElement>(null);
	const [items, setItems] = useState<Array<T>>([]);
	const [page, setPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [isInitialLoad, setIsInitialLoad] = useState(true);
	const [hasError, setHasError] = useState(false);

	// Use ref to track loading state to avoid closure issues in scroll handler
	const isLoadingRef = useRef(false);

	const hasMore = items.length < total;

	const loadData = useCallback(
		async (pageNo: number, isInitial: boolean) => {
			// Use ref to check loading state to avoid stale closure
			if (isLoadingRef.current) {
				return;
			}

			isLoadingRef.current = true;
			setIsLoading(true);
			setHasError(false);

			try {
				const result = await fetchData(pageNo, pageSize);
				if (isInitial) {
					setItems(result.list);
				} else {
					setItems(prev => [...prev, ...result.list]);
				}
				setTotal(result.total);
				setPage(pageNo);
			} catch {
				setHasError(true);
			} finally {
				isLoadingRef.current = false;
				setIsLoading(false);
				if (isInitial) {
					setIsInitialLoad(false);
				}
			}
		},
		[fetchData, pageSize],
	);

	// Initial load
	useEffect(() => {
		loadData(1, true);
	}, [loadData]);

	// Scroll handler
	const handleScroll = useCallback(() => {
		const container = containerRef.current;
		// Use ref to check loading state to avoid stale closure
		if (!container || isLoadingRef.current || !hasMore) {
			return;
		}

		const { scrollTop, scrollHeight, clientHeight } = container;
		const scrollRemaining = scrollHeight - scrollTop - clientHeight;
		const thresholdValue = thresholdMap[threshold];
		const triggerPoint = scrollHeight * thresholdValue;

		if (scrollRemaining <= triggerPoint) {
			loadData(page + 1, false);
		}
	}, [hasMore, page, threshold, loadData]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		container.addEventListener("scroll", handleScroll);
		return () => container.removeEventListener("scroll", handleScroll);
	}, [handleScroll]);

	// Render empty state (centered)
	if (!isInitialLoad && items.length === 0 && !hasError) {
		return (
			<div
				ref={containerRef}
				className={cn(infiniteScrollVariants({ padding, rounded, border }), "h-full", className)}
				data-testid={testId}
			>
				<div className="flex flex-col items-center justify-center h-full text-muted-foreground">
					<Inbox className="w-12 h-12 mb-4" />
					<p className="text-sm">{content.empty}</p>
				</div>
			</div>
		);
	}

	// Render initial loading state (centered)
	if (isInitialLoad && isLoading) {
		return (
			<div
				ref={containerRef}
				className={cn(infiniteScrollVariants({ padding, rounded, border }), "h-full", className)}
				data-testid={testId}
			>
				<div className="flex flex-col items-center justify-center h-full text-muted-foreground">
					<Loader2 className="w-8 h-8 animate-spin" />
				</div>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className={cn(infiniteScrollVariants({ padding, rounded, border }), className)}
			data-testid={testId}
		>
			{/* Items */}
			{items.map((item, index) => (
				<div key={keyExtractor ? keyExtractor(item, index) : index}>{renderItem(item, index)}</div>
			))}

			{/* Bottom loading indicator */}
			{isLoading && !isInitialLoad && (
				<div className="flex justify-center py-4" data-testid="loading-more">
					<Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
				</div>
			)}

			{/* No more indicator */}
			{!isLoading && !hasMore && items.length > 0 && (
				<div className="flex justify-center py-4 text-muted-foreground text-sm" data-testid="no-more">
					{content.noMore}
				</div>
			)}

			{/* Error state */}
			{hasError && (
				<div className="flex justify-center py-4 text-destructive text-sm" data-testid="error">
					{content.error}
				</div>
			)}
		</div>
	);
}
