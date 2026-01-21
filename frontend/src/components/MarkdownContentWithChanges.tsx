import { MarkdownLink } from "./MarkdownContent";
import type { DocDraftSectionChanges, SectionAnnotation } from "jolli-common";
import Markdown from "markdown-to-jsx";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import "./MarkdownContent.css";
import styles from "./MarkdownContentWithChanges.module.css";

interface MarkdownContentWithChangesProps {
	/**
	 * The markdown content to render
	 */
	content: string;
	/**
	 * Section annotations with boundary and change information
	 */
	annotations: Array<SectionAnnotation>;
	/**
	 * Section changes data with proposed content
	 */
	changes: Array<DocDraftSectionChanges>;
	/**
	 * Callback when a section with changes is clicked
	 * @param changeIds - The IDs of the changes associated with the clicked section
	 */
	onSectionClick: (changeIds: Array<number>) => void;
	/**
	 * Set of change IDs whose panels are currently open (for active styling)
	 */
	openPanelChangeIds?: Set<number>;
}

/**
 * Finds the DOM element where a preview should be inserted based on section title.
 * Returns the last element of the section (before the next heading of same or higher level).
 */
function findSectionEndElement(mainContent: Element, sectionTitle: string | null): Element | null {
	const children = Array.from(mainContent.children);

	// For preamble (null title), insert at the beginning (before first heading)
	if (sectionTitle === null) {
		// Find first heading element
		for (let i = 0; i < children.length; i++) {
			const el = children[i];
			if (el.tagName.match(/^H[1-6]$/i)) {
				// Return the element before the first heading, or null if there isn't one
				return i > 0 ? children[i - 1] : null;
			}
		}
		// No headings found, return last element
		return children.length > 0 ? children[children.length - 1] : null;
	}

	// Find the heading element with matching title
	let headingIndex = -1;
	let headingLevel = 0;

	for (let i = 0; i < children.length; i++) {
		const el = children[i];
		const tagMatch = el.tagName.match(/^H([1-6])$/i);
		if (tagMatch) {
			const text = el.textContent?.trim() || "";
			if (text === sectionTitle) {
				headingIndex = i;
				headingLevel = Number.parseInt(tagMatch[1], 10);
				break;
			}
		}
	}

	if (headingIndex === -1) {
		// Section heading not found, fall back to appending at end
		return children.length > 0 ? children[children.length - 1] : null;
	}

	// Find the end of this section (next heading of same or higher level, or end of content)
	for (let i = headingIndex + 1; i < children.length; i++) {
		const el = children[i];
		const tagMatch = el.tagName.match(/^H([1-6])$/i);
		if (tagMatch) {
			const level = Number.parseInt(tagMatch[1], 10);
			if (level <= headingLevel) {
				// Found next section, return the element before it
				return children[i - 1];
			}
		}
	}

	// No next section found, return last element
	return children[children.length - 1];
}

/**
 * Renders markdown content with clickable highlighting for sections that have pending changes.
 */
export function MarkdownContentWithChanges({
	content,
	annotations,
	changes,
	onSectionClick,
	openPanelChangeIds = new Set(),
}: MarkdownContentWithChangesProps): ReactElement {
	const containerRef = useRef<HTMLDivElement>(null);
	const previewsRef = useRef<HTMLDivElement>(null);

	// Apply section highlighting and insert previews after render
	useEffect(() => {
		/* v8 ignore next 3 - defensive guard, refs always available after mount */
		if (!containerRef.current || !previewsRef.current) {
			return;
		}

		const mainContent = containerRef.current.querySelector(".markdownContent > div");
		/* v8 ignore next 3 - defensive guard, Markdown always renders a div wrapper */
		if (!mainContent) {
			return;
		}

		// First, remove any existing preview elements from mainContent (from previous renders)
		/* v8 ignore next 4 - defensive cleanup, useEffect cleanup function already removes clones */
		const existingPreviews = Array.from(mainContent.querySelectorAll(`[data-section-path]`));
		for (const preview of existingPreviews) {
			preview.remove();
		}

		// Position all previews (both section-change and insert-point)
		// IMPORTANT: Clone the previews instead of moving them, so React can still manage the originals
		const allPreviews = Array.from(previewsRef.current.querySelectorAll(`[data-section-path]`));
		const insertedClones: Array<Node> = [];

		for (const annotation of annotations) {
			const preview = allPreviews.find(p => p.getAttribute("data-section-path") === annotation.id);
			/* v8 ignore next 3 - defensive guard, previews generated from annotations so should always match */
			if (!preview) {
				continue;
			}

			// Clone the preview so the original stays in the hidden container for React to manage
			const previewClone = preview.cloneNode(true) as Element;

			// Find the correct insertion point based on section title
			const sectionEndElement = findSectionEndElement(mainContent, annotation.title);

			if (sectionEndElement) {
				// Insert after the last element of this section
				if (sectionEndElement.nextSibling) {
					mainContent.insertBefore(previewClone, sectionEndElement.nextSibling);
				} else {
					mainContent.appendChild(previewClone);
				}
			} else {
				// Fallback: insert at the beginning (for preamble with no content before first heading)
				if (mainContent.firstChild) {
					mainContent.insertBefore(previewClone, mainContent.firstChild);
				} else {
					mainContent.appendChild(previewClone);
				}
			}

			insertedClones.push(previewClone);
		}

		// Set up click handlers
		const clickableElements = mainContent.querySelectorAll(`[data-change-ids]`);

		function handleClick(event: Event) {
			const target = event.currentTarget as HTMLElement;
			const changeIdsStr = target.getAttribute("data-change-ids");

			if (changeIdsStr) {
				try {
					const changeIds = JSON.parse(changeIdsStr) as Array<number>;
					onSectionClick(changeIds);
				} catch (error) {
					console.error("Failed to parse change IDs:", error);
				}
			}
		}

		// Attach listeners
		for (const element of clickableElements) {
			element.addEventListener("click", handleClick);
		}

		// Cleanup - remove cloned previews and event listeners
		return () => {
			for (const element of clickableElements) {
				element.removeEventListener("click", handleClick);
			}
			// Remove the cloned previews (originals stay in hidden container for React)
			for (const clone of insertedClones) {
				clone.parentNode?.removeChild(clone);
			}
		};
	}, [content, annotations, changes, onSectionClick, openPanelChangeIds]);

	return (
		<div ref={containerRef} className="markdownContent">
			<Markdown
				key={content}
				options={{
					overrides: {
						a: MarkdownLink,
					},
				}}
			>
				{content}
			</Markdown>

			{/* Render all change previews separately (hidden initially, positioned by useEffect) */}
			<div ref={previewsRef} style={{ display: "none" }}>
				{annotations.map(annotation => {
					const { id, type, changeIds } = annotation;
					const hasOpenPanel = changeIds.some(changeId => openPanelChangeIds.has(changeId));
					const activeClass = hasOpenPanel ? " active" : "";

					// Get the proposed content for these changes
					const annotationChanges = changeIds
						.map(changeId => changes.find(c => c.id === changeId))
						.filter((c): c is DocDraftSectionChanges => c !== undefined);

					const proposedContent = annotationChanges
						.map(change => {
							const proposedValue = change.proposed[0]?.value;
							if (typeof proposedValue === "string") {
								return proposedValue;
							}
							return "";
						})
						.filter(content => content.length > 0)
						.join("\n\n");

					// Choose styling based on annotation type
					const styleClass = type === "insert-point" ? styles.insertionPoint : styles.editableSection;

					return (
						<div
							key={id}
							data-section-path={id}
							data-change-ids={JSON.stringify(changeIds)}
							className={`${styleClass}${activeClass}`}
						>
							<Markdown
								options={{
									overrides: {
										a: MarkdownLink,
									},
								}}
							>
								{proposedContent}
							</Markdown>
						</div>
					);
				})}
			</div>
		</div>
	);
}
