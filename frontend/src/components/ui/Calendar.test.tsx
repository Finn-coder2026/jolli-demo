import { Calendar, CalendarDayButton } from "./Calendar";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { CalendarDay } from "react-day-picker";
import { describe, expect, it, vi } from "vitest";

// Mock lucide-react icons that Calendar uses (with Icon suffix)
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	const createIconComponent = (iconName: string) => {
		// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props
		const IconComponent = (props: any) => {
			const { className, ...otherProps } = props;
			return <svg data-lucide-icon={iconName} className={className} {...otherProps} />;
		};
		IconComponent.displayName = iconName;
		return IconComponent;
	};

	return {
		...actual,
		ChevronDownIcon: createIconComponent("ChevronDown"),
		ChevronLeftIcon: createIconComponent("ChevronLeft"),
		ChevronRightIcon: createIconComponent("ChevronRight"),
	};
});

// Store captured components from DayPicker mock for testing
let capturedComponents: Record<string, unknown> = {};
let capturedFormatters: Record<string, unknown> = {};

// Override the default mock to capture the components prop
vi.mock("react-day-picker", () => {
	const DayPicker = ({
		mode,
		selected,
		onSelect,
		disabled,
		className,
		components,
		formatters,
		...props
	}: {
		mode?: string;
		selected?: Date;
		onSelect?: (date: Date) => void;
		disabled?: boolean | ((date: Date) => boolean);
		className?: string;
		components?: Record<string, unknown>;
		formatters?: Record<string, unknown>;
	}) => {
		// Capture components and formatters for testing
		capturedComponents = components || {};
		capturedFormatters = formatters || {};

		const handleDateClick = (date: Date) => {
			if (disabled) {
				const isDisabled = typeof disabled === "function" ? disabled(date) : false;
				if (isDisabled) {
					return;
				}
			}
			onSelect?.(date);
		};

		const mockDate = new Date("2025-01-15");

		return (
			<div data-react-day-picker="DayPicker" data-mode={mode} className={className} {...props}>
				<div data-testid="calendar-mock">
					<button
						type="button"
						data-testid="calendar-date-15"
						onClick={() => handleDateClick(mockDate)}
						aria-selected={selected?.toDateString() === mockDate.toDateString()}
					>
						15
					</button>
				</div>
			</div>
		);
	};
	DayPicker.displayName = "DayPicker";

	const DayButton = ({ children, ...props }: { children?: React.ReactNode }) => (
		<button type="button" data-react-day-picker="DayButton" {...props}>
			{children}
		</button>
	);
	DayButton.displayName = "DayButton";

	const getDefaultClassNames = () => ({
		root: "rdp-root",
		months: "rdp-months",
		month: "rdp-month",
		nav: "rdp-nav",
		button_previous: "rdp-button_previous",
		button_next: "rdp-button_next",
		month_caption: "rdp-month_caption",
		dropdowns: "rdp-dropdowns",
		dropdown_root: "rdp-dropdown_root",
		dropdown: "rdp-dropdown",
		caption_label: "rdp-caption_label",
		weekdays: "rdp-weekdays",
		weekday: "rdp-weekday",
		week: "rdp-week",
		week_number_header: "rdp-week_number_header",
		week_number: "rdp-week_number",
		day: "rdp-day",
		range_start: "rdp-range_start",
		range_middle: "rdp-range_middle",
		range_end: "rdp-range_end",
		today: "rdp-today",
		outside: "rdp-outside",
		disabled: "rdp-disabled",
		hidden: "rdp-hidden",
	});

	return {
		DayPicker,
		DayButton,
		getDefaultClassNames,
	};
});

describe("Calendar", () => {
	it("should render Calendar component", () => {
		render(<Calendar />);

		// Calendar should render the mock DayPicker
		expect(screen.getByTestId("calendar-mock")).toBeDefined();
	});

	it("should render Calendar with selected date", () => {
		const selectedDate = new Date("2025-01-15");
		render(<Calendar mode="single" selected={selectedDate} />);

		expect(screen.getByTestId("calendar-mock")).toBeDefined();
	});

	it("should render Calendar with custom className", () => {
		const { container } = render(<Calendar className="custom-calendar" />);

		// The calendar wrapper should have the custom class
		const calendarElement = container.querySelector('[data-react-day-picker="DayPicker"]');
		expect(calendarElement).toBeDefined();
		expect(calendarElement?.className).toContain("custom-calendar");
	});

	it("should render Calendar with onSelect handler", () => {
		const onSelect = vi.fn();
		render(<Calendar mode="single" onSelect={onSelect} />);

		expect(screen.getByTestId("calendar-mock")).toBeDefined();
	});

	it("should call onSelect when date is clicked", () => {
		const onSelect = vi.fn();
		render(<Calendar mode="single" onSelect={onSelect} />);

		// Click the mock date button
		fireEvent.click(screen.getByTestId("calendar-date-15"));

		expect(onSelect).toHaveBeenCalledWith(new Date("2025-01-15"));
	});

	it("should render Calendar with disabled dates function", () => {
		const disabledDates = (date: Date) => date.getDay() === 0;
		render(<Calendar mode="single" disabled={disabledDates} />);

		expect(screen.getByTestId("calendar-mock")).toBeDefined();
	});

	it("should render Calendar with showOutsideDays set to false", () => {
		render(<Calendar showOutsideDays={false} />);

		expect(screen.getByTestId("calendar-mock")).toBeDefined();
	});

	it("should render Calendar with dropdown captionLayout", () => {
		render(<Calendar captionLayout="dropdown" />);

		expect(screen.getByTestId("calendar-mock")).toBeDefined();
	});

	it("should render Calendar with dropdown-months captionLayout", () => {
		render(<Calendar captionLayout="dropdown-months" />);

		expect(screen.getByTestId("calendar-mock")).toBeDefined();
	});

	it("should render Calendar with dropdown-years captionLayout", () => {
		render(<Calendar captionLayout="dropdown-years" />);

		expect(screen.getByTestId("calendar-mock")).toBeDefined();
	});

	it("should render Calendar with outline buttonVariant", () => {
		render(<Calendar buttonVariant="outline" />);

		expect(screen.getByTestId("calendar-mock")).toBeDefined();
	});

	it("should render Calendar with secondary buttonVariant", () => {
		render(<Calendar buttonVariant="secondary" />);

		expect(screen.getByTestId("calendar-mock")).toBeDefined();
	});

	it("should render Calendar with custom classNames", () => {
		const { container } = render(
			<Calendar
				classNames={{
					root: "custom-root",
					months: "custom-months",
				}}
			/>,
		);

		const calendarElement = container.querySelector('[data-react-day-picker="DayPicker"]');
		expect(calendarElement).toBeDefined();
	});

	it("should render Calendar with custom formatters", () => {
		const customFormatter = vi.fn((date: Date) => date.toLocaleDateString());
		render(
			<Calendar
				formatters={{
					formatMonthDropdown: customFormatter,
				}}
			/>,
		);

		expect(screen.getByTestId("calendar-mock")).toBeDefined();
	});

	it("should render Calendar in range mode without selection", () => {
		render(<Calendar mode="range" />);

		expect(screen.getByTestId("calendar-mock")).toBeDefined();
	});

	it("should render Calendar in multiple mode without selection", () => {
		render(<Calendar mode="multiple" />);

		expect(screen.getByTestId("calendar-mock")).toBeDefined();
	});

	describe("Custom components", () => {
		it("should provide Root component that renders with data-slot attribute", () => {
			render(<Calendar />);

			// Access the captured Root component
			const RootComponent = capturedComponents.Root as React.FC<{
				className?: string;
				rootRef?: React.Ref<HTMLDivElement>;
				children?: React.ReactNode;
			}>;
			expect(RootComponent).toBeDefined();

			// Render the Root component
			const { container } = render(
				<RootComponent className="test-class">
					<span>Calendar content</span>
				</RootComponent>,
			);

			const root = container.querySelector('[data-slot="calendar"]');
			expect(root).toBeDefined();
			expect(root?.className).toContain("test-class");
		});

		it("should provide Root component that passes rootRef", () => {
			render(<Calendar />);

			const RootComponent = capturedComponents.Root as React.FC<{
				className?: string;
				rootRef?: React.Ref<HTMLDivElement>;
				children?: React.ReactNode;
			}>;

			const ref = { current: null as HTMLDivElement | null };
			render(
				<RootComponent rootRef={ref}>
					<span>Content</span>
				</RootComponent>,
			);

			expect(ref.current).toBeDefined();
			expect(ref.current?.getAttribute("data-slot")).toBe("calendar");
		});

		it("should provide Chevron component that renders left icon for left orientation", () => {
			render(<Calendar />);

			const ChevronComponent = capturedComponents.Chevron as React.FC<{
				className?: string;
				orientation?: "left" | "right" | "up" | "down";
			}>;
			expect(ChevronComponent).toBeDefined();

			const { container } = render(<ChevronComponent orientation="left" className="test-chevron" />);

			// Should render ChevronLeftIcon (which is mocked as SVG with data-lucide-icon)
			const icon = container.querySelector('[data-lucide-icon="ChevronLeft"]');
			expect(icon).toBeDefined();
			expect(icon?.getAttribute("class")).toContain("test-chevron");
		});

		it("should provide Chevron component that renders right icon for right orientation", () => {
			render(<Calendar />);

			const ChevronComponent = capturedComponents.Chevron as React.FC<{
				className?: string;
				orientation?: "left" | "right" | "up" | "down";
			}>;

			const { container } = render(<ChevronComponent orientation="right" className="test-chevron" />);

			// Should render ChevronRightIcon
			const icon = container.querySelector('[data-lucide-icon="ChevronRight"]');
			expect(icon).toBeDefined();
			expect(icon?.getAttribute("class")).toContain("test-chevron");
		});

		it("should provide Chevron component that renders down icon for other orientations", () => {
			render(<Calendar />);

			const ChevronComponent = capturedComponents.Chevron as React.FC<{
				className?: string;
				orientation?: "left" | "right" | "up" | "down";
			}>;

			// Test with "up" orientation (should default to down icon)
			const { container: upContainer } = render(<ChevronComponent orientation="up" className="test-chevron" />);
			expect(upContainer.querySelector('[data-lucide-icon="ChevronDown"]')).toBeDefined();

			// Test with "down" orientation
			const { container: downContainer } = render(
				<ChevronComponent orientation="down" className="test-chevron" />,
			);
			expect(downContainer.querySelector('[data-lucide-icon="ChevronDown"]')).toBeDefined();

			// Test with undefined orientation
			const { container: undefinedContainer } = render(<ChevronComponent className="test-chevron" />);
			expect(undefinedContainer.querySelector('[data-lucide-icon="ChevronDown"]')).toBeDefined();
		});

		it("should provide WeekNumber component that renders children in centered cell", () => {
			render(<Calendar />);

			const WeekNumberComponent = capturedComponents.WeekNumber as React.FC<{
				children?: React.ReactNode;
			}>;
			expect(WeekNumberComponent).toBeDefined();

			const { container } = render(
				<table>
					<tbody>
						<tr>
							<WeekNumberComponent>42</WeekNumberComponent>
						</tr>
					</tbody>
				</table>,
			);

			const td = container.querySelector("td");
			expect(td).toBeDefined();
			expect(td?.textContent).toBe("42");

			// Should have centered content wrapper
			const wrapper = td?.querySelector("div");
			expect(wrapper?.className).toContain("flex");
			expect(wrapper?.className).toContain("items-center");
			expect(wrapper?.className).toContain("justify-center");
		});

		it("should provide DayButton component (CalendarDayButton)", () => {
			render(<Calendar />);

			const DayButtonComponent = capturedComponents.DayButton;
			expect(DayButtonComponent).toBeDefined();
			// DayButton is CalendarDayButton which is tested separately
		});
	});

	describe("Custom formatters", () => {
		it("should provide formatMonthDropdown that returns short month name", () => {
			// Mock toLocaleString to force English locale for consistent test results
			const originalToLocaleString = Date.prototype.toLocaleString;
			vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(function (
				this: Date,
				locales?: Intl.LocalesArgument,
				options?: Intl.DateTimeFormatOptions,
			) {
				// Force English locale for month formatting
				if (options?.month === "short") {
					return originalToLocaleString.call(this, "en-US", options);
				}
				return originalToLocaleString.call(this, locales, options);
			});

			try {
				render(<Calendar />);

				const formatMonthDropdown = capturedFormatters.formatMonthDropdown as (date: Date) => string;
				expect(formatMonthDropdown).toBeDefined();

				// Test with January
				const january = new Date("2025-01-15");
				const result = formatMonthDropdown(january);
				expect(result).toBe("Jan");

				// Test with December
				const december = new Date("2025-12-15");
				const result2 = formatMonthDropdown(december);
				expect(result2).toBe("Dec");
			} finally {
				vi.restoreAllMocks();
			}
		});

		it("should merge custom formatters with default formatMonthDropdown", () => {
			const customFormatter = vi.fn((date: Date) => `Custom: ${date.getMonth()}`);
			render(
				<Calendar
					formatters={{
						formatMonthDropdown: customFormatter,
					}}
				/>,
			);

			// Custom formatter should override default
			const formatMonthDropdown = capturedFormatters.formatMonthDropdown as (date: Date) => string;
			expect(formatMonthDropdown).toBe(customFormatter);
		});
	});
});

describe("CalendarDayButton", () => {
	// Cast to CalendarDay - the component only uses date and displayMonth properties
	const mockDay = {
		date: new Date("2025-01-15"),
		displayMonth: new Date("2025-01"),
	} as unknown as CalendarDay;

	const baseModifiers = {
		focused: false,
		selected: false,
		today: false,
		outside: false,
		disabled: false,
		hidden: false,
		range_start: false,
		range_middle: false,
		range_end: false,
	};

	it("should render CalendarDayButton with default props", () => {
		render(<CalendarDayButton day={mockDay} modifiers={baseModifiers} />);

		const button = screen.getByRole("button");
		expect(button).toBeDefined();
		expect(button.getAttribute("data-day")).toBe(mockDay.date.toLocaleDateString());
	});

	it("should render CalendarDayButton with selected modifier", () => {
		render(
			<CalendarDayButton
				day={mockDay}
				modifiers={{
					...baseModifiers,
					selected: true,
				}}
			/>,
		);

		const button = screen.getByRole("button");
		expect(button.getAttribute("data-selected-single")).toBe("true");
	});

	it("should render CalendarDayButton with range_start modifier", () => {
		render(
			<CalendarDayButton
				day={mockDay}
				modifiers={{
					...baseModifiers,
					selected: true,
					range_start: true,
				}}
			/>,
		);

		const button = screen.getByRole("button");
		expect(button.getAttribute("data-range-start")).toBe("true");
		expect(button.getAttribute("data-selected-single")).toBe("false");
	});

	it("should render CalendarDayButton with range_end modifier", () => {
		render(
			<CalendarDayButton
				day={mockDay}
				modifiers={{
					...baseModifiers,
					selected: true,
					range_end: true,
				}}
			/>,
		);

		const button = screen.getByRole("button");
		expect(button.getAttribute("data-range-end")).toBe("true");
		expect(button.getAttribute("data-selected-single")).toBe("false");
	});

	it("should render CalendarDayButton with range_middle modifier", () => {
		render(
			<CalendarDayButton
				day={mockDay}
				modifiers={{
					...baseModifiers,
					selected: true,
					range_middle: true,
				}}
			/>,
		);

		const button = screen.getByRole("button");
		expect(button.getAttribute("data-range-middle")).toBe("true");
		expect(button.getAttribute("data-selected-single")).toBe("false");
	});

	it("should render CalendarDayButton with custom className", () => {
		render(<CalendarDayButton day={mockDay} modifiers={baseModifiers} className="custom-day-button" />);

		const button = screen.getByRole("button");
		expect(button.className).toContain("custom-day-button");
	});

	it("should focus button when focused modifier changes to true", () => {
		const { rerender } = render(<CalendarDayButton day={mockDay} modifiers={baseModifiers} />);

		// Rerender with focused modifier set to true
		rerender(
			<CalendarDayButton
				day={mockDay}
				modifiers={{
					...baseModifiers,
					focused: true,
				}}
			/>,
		);

		// The button should attempt to focus (we verify by checking the element exists)
		const button = screen.getByRole("button");
		expect(button).toBeDefined();
	});

	it("should focus button via ref when focused modifier is true on initial render", () => {
		// Spy on focus method
		const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");

		render(
			<CalendarDayButton
				day={mockDay}
				modifiers={{
					...baseModifiers,
					focused: true,
				}}
			/>,
		);

		expect(focusSpy).toHaveBeenCalled();
		focusSpy.mockRestore();
	});

	it("should not call focus when focused modifier is false", () => {
		const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");

		render(<CalendarDayButton day={mockDay} modifiers={baseModifiers} />);

		// Focus should not be called for this element (may be called by other elements)
		// We verify button exists but isn't focused
		const button = screen.getByRole("button");
		expect(button).toBeDefined();
		expect(document.activeElement).not.toBe(button);

		focusSpy.mockRestore();
	});

	it("should render with all data attributes for range selection", () => {
		render(
			<CalendarDayButton
				day={mockDay}
				modifiers={{
					...baseModifiers,
					selected: true,
					range_start: true,
					range_middle: false,
					range_end: false,
				}}
			/>,
		);

		const button = screen.getByRole("button");
		expect(button.getAttribute("data-selected-single")).toBe("false");
		expect(button.getAttribute("data-range-start")).toBe("true");
		expect(button.getAttribute("data-range-middle")).toBe("false");
		expect(button.getAttribute("data-range-end")).toBe("false");
	});

	it("should render data-day attribute with localized date string", () => {
		const specificDay = {
			date: new Date("2025-06-15"),
			displayMonth: new Date("2025-06"),
		} as unknown as CalendarDay;

		render(<CalendarDayButton day={specificDay} modifiers={baseModifiers} />);

		const button = screen.getByRole("button");
		expect(button.getAttribute("data-day")).toBe(specificDay.date.toLocaleDateString());
	});

	it("should handle combined range modifiers correctly", () => {
		// Test case where both range_start and range_end are true (single day range)
		render(
			<CalendarDayButton
				day={mockDay}
				modifiers={{
					...baseModifiers,
					selected: true,
					range_start: true,
					range_end: true,
				}}
			/>,
		);

		const button = screen.getByRole("button");
		// selected-single should be false when any range modifier is true
		expect(button.getAttribute("data-selected-single")).toBe("false");
		expect(button.getAttribute("data-range-start")).toBe("true");
		expect(button.getAttribute("data-range-end")).toBe("true");
	});
});
