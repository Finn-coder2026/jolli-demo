import { UserElement } from "./UserElement";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

describe("UserElement", () => {
	const mockUserInfo = {
		email: "test@example.com",
		name: "Test User",
		picture: "https://example.com/avatar.jpg",
		userId: 123,
	};

	it("should render user name and email", () => {
		const doLogout = vi.fn();
		render(<UserElement userInfo={mockUserInfo} doLogout={doLogout} />);

		expect(screen.getByText("Test User")).toBeDefined();
		expect(screen.getByText("test@example.com")).toBeDefined();
	});

	it("should render logout button", () => {
		const doLogout = vi.fn();
		render(<UserElement userInfo={mockUserInfo} doLogout={doLogout} />);

		expect(screen.getByText("Logout")).toBeDefined();
	});

	it("should render profile image when available", () => {
		const doLogout = vi.fn();
		const { container } = render(<UserElement userInfo={mockUserInfo} doLogout={doLogout} />);

		const img = container.querySelector("img");
		expect(img).toBeDefined();
		expect(img?.src).toBe("https://example.com/avatar.jpg");
		expect(img?.alt).toBe("Profile");
	});

	it("should not render profile image when not available", () => {
		const userInfoWithoutPicture = {
			...mockUserInfo,
			picture: undefined,
		};
		const doLogout = vi.fn();
		const { container } = render(<UserElement userInfo={userInfoWithoutPicture} doLogout={doLogout} />);

		const img = container.querySelector("img");
		expect(img).toBeNull();
	});

	it("should call doLogout when logout button is clicked", () => {
		const doLogout = vi.fn();
		render(<UserElement userInfo={mockUserInfo} doLogout={doLogout} />);

		const logoutButton = screen.getByText("Logout");
		logoutButton.click();

		expect(doLogout).toHaveBeenCalledTimes(1);
	});

	it("should render email as name when name is not available", () => {
		const userInfoWithoutName = {
			email: "test@example.com",
			name: "test@example.com",
			picture: undefined,
			userId: 123,
		};
		const doLogout = vi.fn();
		const { container } = render(<UserElement userInfo={userInfoWithoutName} doLogout={doLogout} />);

		const nameElement = container.querySelector(".name");
		const emailElement = container.querySelector(".email");
		expect(nameElement?.textContent).toBe("test@example.com");
		expect(emailElement?.textContent).toBe("test@example.com");
	});
});
