import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./Tooltip";
import * as React from "react";

/**
 * Why this wrapper exists
 * -----------------------
 * We observed a tooltip "flash then disappear" issue in the space tree yellow-dot indicator.
 *
 * Key logs captured during debugging:
 * 1) 14:25:57.390 -> suggestion-dot-pointer-enter
 * 2) ~737ms later (14:25:58.127) -> first tooltip-open-change
 *    This matches Radix Tooltip default delayDuration=700ms.
 * 3) 6ms later (14:25:58.133) -> second tooltip-open-change
 * 4) Real pointer leave happened much later:
 *    14:26:00.462 -> suggestion-dot-pointer-leave (about 2.3s later)
 *
 * Conclusion:
 * The tooltip was not closing because the pointer left. It was being closed internally
 * right after opening. This aligns with the Preact + Radix/shadcn integration symptom:
 * uncontrolled open state can oscillate (open -> close) immediately after open in
 * specific trigger/portal timing paths.
 *
 * Mitigation implemented here:
 * - Use controlled `open` state.
 * - Treat trigger and tooltip content as one hover region.
 * - Add short delayed close to tolerate pointer travel from trigger to content.
 * - Ignore close while pointer is still inside the shared hover region.
 *
 * This keeps business components clean: they provide content + trigger only.
 */

type TooltipContentProps = React.ComponentPropsWithoutRef<typeof TooltipContent>;
type TriggerChildProps = {
	onPointerEnter?: React.PointerEventHandler<HTMLElement>;
	onPointerLeave?: React.PointerEventHandler<HTMLElement>;
	onFocus?: React.FocusEventHandler<HTMLElement>;
	onBlur?: React.FocusEventHandler<HTMLElement>;
};

function composeEventHandlers<E>(
	existing?: ((event: E) => void) | undefined,
	next?: ((event: E) => void) | undefined,
): (event: E) => void {
	return (event: E) => {
		existing?.(event);
		next?.(event);
	};
}

export interface HoverTooltipProps {
	content: React.ReactNode;
	children: React.ReactElement;
	disabled?: boolean;
	delayDuration?: number;
	skipDelayDuration?: number;
	closeDelayMs?: number;
	contentClassName?: string;
	side?: TooltipContentProps["side"];
	align?: TooltipContentProps["align"];
	sideOffset?: number;
}

export function HoverTooltip({
	content,
	children,
	disabled = false,
	delayDuration = 0,
	skipDelayDuration = 300,
	closeDelayMs = 100,
	contentClassName,
	side = "right",
	align,
	sideOffset,
}: HoverTooltipProps): React.ReactElement {
	const [open, setOpen] = React.useState(false);
	const closeTimeoutRef = React.useRef<number | null>(null);
	const isPointerInsideTooltipRegionRef = React.useRef(false);

	const clearCloseTimeout = React.useCallback(() => {
		if (closeTimeoutRef.current === null) {
			return;
		}
		window.clearTimeout(closeTimeoutRef.current);
		closeTimeoutRef.current = null;
	}, []);

	const scheduleClose = React.useCallback(() => {
		clearCloseTimeout();
		closeTimeoutRef.current = window.setTimeout(() => {
			/* v8 ignore start -- Defensive branch: enter handlers clear timeout before callback can run */
			if (isPointerInsideTooltipRegionRef.current) {
				return;
			}
			/* v8 ignore stop */
			setOpen(false);
			closeTimeoutRef.current = null;
		}, closeDelayMs);
	}, [clearCloseTimeout, closeDelayMs]);

	React.useEffect(() => {
		return () => {
			clearCloseTimeout();
		};
	}, [clearCloseTimeout]);

	const handleOpenChange = React.useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) {
				clearCloseTimeout();
				setOpen(true);
				return;
			}

			if (isPointerInsideTooltipRegionRef.current) {
				return;
			}
			setOpen(false);
		},
		[clearCloseTimeout],
	);

	const handleTriggerEnter = React.useCallback(() => {
		isPointerInsideTooltipRegionRef.current = true;
		clearCloseTimeout();
		setOpen(true);
	}, [clearCloseTimeout]);

	const handleTriggerLeave = React.useCallback(() => {
		isPointerInsideTooltipRegionRef.current = false;
		scheduleClose();
	}, [scheduleClose]);

	const handleContentEnter = React.useCallback(() => {
		isPointerInsideTooltipRegionRef.current = true;
		clearCloseTimeout();
		setOpen(true);
	}, [clearCloseTimeout]);

	const handleContentLeave = React.useCallback(() => {
		isPointerInsideTooltipRegionRef.current = false;
		scheduleClose();
	}, [scheduleClose]);

	if (disabled) {
		return children;
	}

	const childProps = children.props as TriggerChildProps;
	const trigger = React.cloneElement(children, {
		onPointerEnter: composeEventHandlers(childProps.onPointerEnter, handleTriggerEnter),
		onPointerLeave: composeEventHandlers(childProps.onPointerLeave, handleTriggerLeave),
		onFocus: composeEventHandlers(childProps.onFocus, handleTriggerEnter),
		onBlur: composeEventHandlers(childProps.onBlur, handleTriggerLeave),
	} as TriggerChildProps);

	return (
		<TooltipProvider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
			<Tooltip open={open} onOpenChange={handleOpenChange}>
				<TooltipTrigger asChild>{trigger}</TooltipTrigger>
				<TooltipContent
					side={side}
					{...(align !== undefined && { align })}
					{...(sideOffset !== undefined && { sideOffset })}
					className={contentClassName}
					onPointerEnter={handleContentEnter}
					onPointerLeave={handleContentLeave}
				>
					{content}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
