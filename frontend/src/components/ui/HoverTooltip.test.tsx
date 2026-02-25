import { HoverTooltip } from "./HoverTooltip";
import { act, fireEvent, render, screen } from "@testing-library/preact";
import type { PointerEventHandler, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./Tooltip", () => ({
	TooltipProvider: vi.fn(
		({
			children,
			delayDuration,
			skipDelayDuration,
		}: {
			children: ReactNode;
			delayDuration?: number;
			skipDelayDuration?: number;
		}) => (
			<div
				data-testid="tooltip-provider"
				data-delay-duration={delayDuration}
				data-skip-delay-duration={skipDelayDuration}
			>
				{children}
			</div>
		),
	),
	Tooltip: vi.fn(
		({
			children,
			open,
			onOpenChange,
		}: {
			children: ReactNode;
			open?: boolean;
			onOpenChange?: (open: boolean) => void;
		}) => (
			<div data-testid="tooltip-root" data-open={open ? "true" : "false"}>
				<button type="button" data-testid="mock-root-open" onClick={() => onOpenChange?.(true)} />
				<button type="button" data-testid="mock-root-close" onClick={() => onOpenChange?.(false)} />
				{children}
			</div>
		),
	),
	TooltipTrigger: vi.fn(({ children, asChild }: { children: ReactNode; asChild?: boolean }) =>
		asChild ? children : <button type="button">{children}</button>,
	),
	TooltipContent: vi.fn(
		({
			children,
			className,
			side,
			align,
			sideOffset,
			onPointerEnter,
			onPointerLeave,
		}: {
			children: ReactNode;
			className?: string;
			side?: string;
			align?: string;
			sideOffset?: number;
			onPointerEnter?: PointerEventHandler<HTMLDivElement>;
			onPointerLeave?: PointerEventHandler<HTMLDivElement>;
		}) => (
			<div
				data-testid="tooltip-content"
				data-side={side}
				data-align={align}
				data-side-offset={sideOffset}
				className={className}
				onPointerEnter={onPointerEnter}
				onPointerLeave={onPointerLeave}
			>
				{children}
			</div>
		),
	),
}));

describe("HoverTooltip", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should return children directly when disabled", () => {
		render(
			<HoverTooltip disabled={true} content="Tooltip">
				<button type="button" data-testid="trigger">
					Trigger
				</button>
			</HoverTooltip>,
		);

		expect(screen.getByTestId("trigger")).toBeDefined();
		expect(screen.queryByTestId("tooltip-provider")).toBeNull();
		expect(screen.queryByTestId("tooltip-content")).toBeNull();
	});

	it("should render with default provider and content props", () => {
		render(
			<HoverTooltip content="Tooltip text">
				<button type="button" data-testid="trigger">
					Trigger
				</button>
			</HoverTooltip>,
		);

		const provider = screen.getByTestId("tooltip-provider");
		const root = screen.getByTestId("tooltip-root");
		const content = screen.getByTestId("tooltip-content");

		expect(provider.getAttribute("data-delay-duration")).toBe("0");
		expect(provider.getAttribute("data-skip-delay-duration")).toBe("300");
		expect(root.getAttribute("data-open")).toBe("false");
		expect(content.getAttribute("data-side")).toBe("right");
		expect(content.textContent).toContain("Tooltip text");
	});

	it("should pass custom props to provider and content", () => {
		render(
			<HoverTooltip
				content={<span>Custom</span>}
				delayDuration={12}
				skipDelayDuration={34}
				side="bottom"
				align="start"
				sideOffset={8}
				contentClassName="custom-tooltip"
			>
				<button type="button" data-testid="trigger">
					Trigger
				</button>
			</HoverTooltip>,
		);

		const provider = screen.getByTestId("tooltip-provider");
		const content = screen.getByTestId("tooltip-content");

		expect(provider.getAttribute("data-delay-duration")).toBe("12");
		expect(provider.getAttribute("data-skip-delay-duration")).toBe("34");
		expect(content.getAttribute("data-side")).toBe("bottom");
		expect(content.getAttribute("data-align")).toBe("start");
		expect(content.getAttribute("data-side-offset")).toBe("8");
		expect(content.className).toContain("custom-tooltip");
		expect(content.textContent).toContain("Custom");
	});

	it("should open on trigger enter and close after delay on leave", () => {
		vi.useFakeTimers();

		render(
			<HoverTooltip content="Tooltip text">
				<button type="button" data-testid="trigger">
					Trigger
				</button>
			</HoverTooltip>,
		);

		const trigger = screen.getByTestId("trigger");
		const root = screen.getByTestId("tooltip-root");

		fireEvent.pointerEnter(trigger);
		expect(root.getAttribute("data-open")).toBe("true");

		fireEvent.pointerLeave(trigger);

		act(() => {
			vi.advanceTimersByTime(99);
		});
		expect(root.getAttribute("data-open")).toBe("true");

		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(root.getAttribute("data-open")).toBe("false");
	});

	it("should keep open when pointer moves from trigger to content before timeout", () => {
		vi.useFakeTimers();

		render(
			<HoverTooltip content="Tooltip text">
				<button type="button" data-testid="trigger">
					Trigger
				</button>
			</HoverTooltip>,
		);

		const trigger = screen.getByTestId("trigger");
		const content = screen.getByTestId("tooltip-content");
		const root = screen.getByTestId("tooltip-root");

		fireEvent.pointerEnter(trigger);
		expect(root.getAttribute("data-open")).toBe("true");

		fireEvent.pointerLeave(trigger);
		fireEvent.pointerEnter(content);

		act(() => {
			vi.advanceTimersByTime(150);
		});
		expect(root.getAttribute("data-open")).toBe("true");

		fireEvent.pointerLeave(content);
		act(() => {
			vi.advanceTimersByTime(100);
		});
		expect(root.getAttribute("data-open")).toBe("false");
	});

	it("should handle onOpenChange true/false with pointer-inside guard", () => {
		render(
			<HoverTooltip content="Tooltip text">
				<button type="button" data-testid="trigger">
					Trigger
				</button>
			</HoverTooltip>,
		);

		const trigger = screen.getByTestId("trigger");
		const root = screen.getByTestId("tooltip-root");
		const forceOpen = screen.getByTestId("mock-root-open");
		const forceClose = screen.getByTestId("mock-root-close");

		fireEvent.click(forceOpen);
		expect(root.getAttribute("data-open")).toBe("true");

		// Pointer is inside trigger region: close signal should be ignored
		fireEvent.pointerEnter(trigger);
		fireEvent.click(forceClose);
		expect(root.getAttribute("data-open")).toBe("true");

		// Pointer left region: close signal should apply immediately
		fireEvent.pointerLeave(trigger);
		fireEvent.click(forceClose);
		expect(root.getAttribute("data-open")).toBe("false");
	});

	it("should clear pending close timeout when reopened", () => {
		vi.useFakeTimers();
		const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

		render(
			<HoverTooltip content="Tooltip text">
				<button type="button" data-testid="trigger">
					Trigger
				</button>
			</HoverTooltip>,
		);

		const trigger = screen.getByTestId("trigger");
		const root = screen.getByTestId("tooltip-root");
		const forceOpen = screen.getByTestId("mock-root-open");

		fireEvent.pointerEnter(trigger);
		fireEvent.pointerLeave(trigger); // schedule close
		fireEvent.click(forceOpen); // should clear the scheduled timeout

		expect(clearTimeoutSpy).toHaveBeenCalled();
		expect(root.getAttribute("data-open")).toBe("true");

		act(() => {
			vi.advanceTimersByTime(200);
		});
		expect(root.getAttribute("data-open")).toBe("true");
	});

	it("should compose trigger existing handlers with internal handlers", () => {
		vi.useFakeTimers();
		const onPointerEnter = vi.fn();
		const onPointerLeave = vi.fn();

		render(
			<HoverTooltip content="Tooltip text">
				<button
					type="button"
					data-testid="trigger"
					onPointerEnter={onPointerEnter}
					onPointerLeave={onPointerLeave}
				>
					Trigger
				</button>
			</HoverTooltip>,
		);

		const trigger = screen.getByTestId("trigger");
		const root = screen.getByTestId("tooltip-root");

		fireEvent.pointerEnter(trigger);
		fireEvent.pointerLeave(trigger);

		expect(onPointerEnter).toHaveBeenCalledTimes(1);
		expect(onPointerLeave).toHaveBeenCalledTimes(1);

		act(() => {
			vi.runAllTimers();
		});
		expect(root.getAttribute("data-open")).toBe("false");
	});

	it("should clear timeout on unmount when close is pending", () => {
		vi.useFakeTimers();
		const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

		const { unmount } = render(
			<HoverTooltip content="Tooltip text" closeDelayMs={250}>
				<button type="button" data-testid="trigger">
					Trigger
				</button>
			</HoverTooltip>,
		);

		const trigger = screen.getByTestId("trigger");
		fireEvent.pointerEnter(trigger);
		fireEvent.pointerLeave(trigger); // pending close

		unmount();

		expect(clearTimeoutSpy).toHaveBeenCalled();
	});
});
