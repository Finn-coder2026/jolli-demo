import { Button } from "./Button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface PaginationProps {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
}

/**
 * Generates an array of page numbers to display with ellipsis for large page counts.
 * Shows up to 7 buttons: [1] ... [4] [5] [6] ... [10]
 */
function getPageNumbers(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
	if (totalPages <= 7) {
		// Show all pages if 7 or fewer
		return Array.from({ length: totalPages }, (_, i) => i + 1);
	}

	const pages: Array<number | "ellipsis"> = [];

	// Always show first page
	pages.push(1);

	if (currentPage <= 3) {
		// Near the start: [1] [2] [3] [4] ... [10]
		pages.push(2, 3, 4, "ellipsis", totalPages);
	} else if (currentPage >= totalPages - 2) {
		// Near the end: [1] ... [7] [8] [9] [10]
		pages.push("ellipsis", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
	} else {
		// In the middle: [1] ... [4] [5] [6] ... [10]
		pages.push("ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages);
	}

	return pages;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps): ReactElement {
	const content = useIntlayer("pagination");
	const pageNumbers = getPageNumbers(currentPage, totalPages);
	const isFirstPage = currentPage === 1;
	const isLastPage = currentPage === totalPages;

	return (
		<nav className="flex items-center gap-1" aria-label={content.ariaLabel.value}>
			<Button
				variant="outline"
				size="sm"
				onClick={() => onPageChange(currentPage - 1)}
				disabled={isFirstPage}
				aria-label={content.previousPage.value}
			>
				<ChevronLeft className="h-4 w-4" />
			</Button>

			{pageNumbers.map((page, index) => {
				if (page === "ellipsis") {
					return (
						<span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
							...
						</span>
					);
				}

				const isCurrentPage = page === currentPage;

				return (
					<Button
						key={page}
						variant={isCurrentPage ? "default" : "outline"}
						size="sm"
						onClick={() => onPageChange(page)}
						aria-label={`${content.page} ${page}`}
						aria-current={isCurrentPage ? "page" : undefined}
						className="min-w-[2.5rem]"
					>
						{page}
					</Button>
				);
			})}

			<Button
				variant="outline"
				size="sm"
				onClick={() => onPageChange(currentPage + 1)}
				disabled={isLastPage}
				aria-label={content.nextPage.value}
			>
				<ChevronRight className="h-4 w-4" />
			</Button>
		</nav>
	);
}
