import { UserAvatar } from "./UserAvatar";
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("UserAvatar", () => {
	it("renders with picture URL", () => {
		const { getByTestId } = render(
			<UserAvatar
				userId={123}
				name="John Doe"
				email="john@example.com"
				picture="https://example.com/avatar.jpg"
			/>,
		);

		const avatar = getByTestId("user-avatar-123");
		expect(avatar.tagName).toBe("IMG");
		expect(avatar.getAttribute("src")).toBe("https://example.com/avatar.jpg");
		expect(avatar.getAttribute("alt")).toBe("John Doe");
	});

	it("renders initials fallback from name", () => {
		const { getByTestId } = render(<UserAvatar userId={123} name="John Doe" />);

		const avatar = getByTestId("user-avatar-123");
		expect(avatar.textContent).toBe("JD");
	});

	it("renders initials from single name", () => {
		const { getByTestId } = render(<UserAvatar userId={123} name="John" />);

		const avatar = getByTestId("user-avatar-123");
		expect(avatar.textContent).toBe("JO");
	});

	it("renders initials fallback from email", () => {
		const { getByTestId } = render(<UserAvatar userId={123} email="john@example.com" />);

		const avatar = getByTestId("user-avatar-123");
		expect(avatar.textContent).toBe("JO");
	});

	it("renders generic icon when no name or email", () => {
		const { getByTestId } = render(<UserAvatar userId={123} />);

		const avatar = getByTestId("user-avatar-123");
		// Should have SVG icon child
		expect(avatar.querySelector("svg")).toBeTruthy();
	});

	it("renders small size", () => {
		const { getByTestId } = render(<UserAvatar userId={123} name="John" size="small" />);

		const avatar = getByTestId("user-avatar-123");
		expect(avatar.className).toContain("h-6");
		expect(avatar.className).toContain("w-6");
	});

	it("renders medium size by default", () => {
		const { getByTestId } = render(<UserAvatar userId={123} name="John" />);

		const avatar = getByTestId("user-avatar-123");
		expect(avatar.className).toContain("h-8");
		expect(avatar.className).toContain("w-8");
	});

	it("renders large size", () => {
		const { getByTestId } = render(<UserAvatar userId={123} name="John" size="large" />);

		const avatar = getByTestId("user-avatar-123");
		expect(avatar.className).toContain("h-10");
		expect(avatar.className).toContain("w-10");
	});

	it("shows tooltip by default", () => {
		const { getByTestId } = render(<UserAvatar userId={123} name="John Doe" />);

		const avatar = getByTestId("user-avatar-123");
		expect(avatar.getAttribute("title")).toBe("John Doe");
	});

	it("hides tooltip when showTooltip is false", () => {
		const { getByTestId } = render(<UserAvatar userId={123} name="John Doe" showTooltip={false} />);

		const avatar = getByTestId("user-avatar-123");
		expect(avatar.getAttribute("title")).toBeNull();
	});

	it("uses email in tooltip when name is not provided", () => {
		const { getByTestId } = render(<UserAvatar userId={123} email="john@example.com" />);

		const avatar = getByTestId("user-avatar-123");
		expect(avatar.getAttribute("title")).toBe("john@example.com");
	});

	it("uses userId in tooltip when neither name nor email provided", () => {
		const { getByTestId } = render(<UserAvatar userId={123} />);

		const avatar = getByTestId("user-avatar-123");
		expect(avatar.getAttribute("title")).toBe("User 123");
	});
});
