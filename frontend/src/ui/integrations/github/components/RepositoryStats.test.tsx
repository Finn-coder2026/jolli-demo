import { RepositoryStats } from "./RepositoryStats";
import { render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";

describe("RepositoryStats", () => {
	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	it("should render with singular repository", () => {
		render(<RepositoryStats enabledCount={0} totalCount={1} />);
		expect(screen.getByText("0 of 1 repository enabled")).toBeDefined();
	});

	it("should render with plural repositories", () => {
		render(<RepositoryStats enabledCount={1} totalCount={2} />);
		expect(screen.getByText("1 of 2 repositories enabled")).toBeDefined();
	});

	it("should render when all repos are enabled", () => {
		render(<RepositoryStats enabledCount={5} totalCount={5} />);
		expect(screen.getByText("5 of 5 repositories enabled")).toBeDefined();
	});

	it("should render when no repos are enabled", () => {
		render(<RepositoryStats enabledCount={0} totalCount={10} />);
		expect(screen.getByText("0 of 10 repositories enabled")).toBeDefined();
	});
});
