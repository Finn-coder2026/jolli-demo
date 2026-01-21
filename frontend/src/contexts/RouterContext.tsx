import { createContext, type ReactElement, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

interface Location {
	pathname: string;
	search: string;
	hash: string;
}

interface RouterContextValue {
	location: Location;
	navigate(to: string): void;
	open(pathname: string): void;
	redirect(to: string): void;
}

const RouterContext = createContext<RouterContextValue | undefined>(undefined);

interface RouterProviderProps {
	children: ReactNode;
	initialPath?: string; // For testing
}

export function RouterProvider({ children, initialPath }: RouterProviderProps): ReactElement {
	function getLocationFromWindow(): Location {
		return {
			pathname: window.location.pathname,
			search: window.location.search,
			hash: window.location.hash,
		};
	}

	function getLocationFromPath(path: string): Location {
		const url = new URL(path, window.location.origin);
		return {
			pathname: url.pathname,
			search: url.search,
			hash: url.hash,
		};
	}

	const [location, setLocation] = useState<Location>(() => {
		if (initialPath) {
			return getLocationFromPath(initialPath);
		}
		return getLocationFromWindow();
	});

	const navigate = useCallback((to: string) => {
		const newLocation = getLocationFromPath(to);
		window.history.pushState({}, "", to);
		setLocation(newLocation);
	}, []);

	function open(pathname: string): void {
		window.open(pathname, "_blank");
	}

	function redirect(to: string): void {
		window.location.href = to;
	}

	useEffect(() => {
		// Don't listen to popstate if we have an initialPath (testing mode)
		if (initialPath) {
			return;
		}

		function handlePopState(): void {
			setLocation(getLocationFromWindow());
		}

		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, [initialPath]);

	return <RouterContext.Provider value={{ location, navigate, open, redirect }}>{children}</RouterContext.Provider>;
}

export function useLocation(): Location {
	const context = useContext(RouterContext);
	if (!context) {
		throw new Error("useLocation must be used within RouterProvider");
	}
	return context.location;
}

export function useNavigate(): (to: string) => void {
	const context = useContext(RouterContext);
	if (!context) {
		throw new Error("useNavigate must be used within RouterProvider");
	}
	return context.navigate;
}

export function useOpen(): (to: string) => void {
	const context = useContext(RouterContext);
	if (!context) {
		throw new Error("useOpen must be used within RouterProvider");
	}
	return context.open;
}

export function useRedirect(): (to: string) => void {
	const context = useContext(RouterContext);
	if (!context) {
		throw new Error("useRedirect must be used within RouterProvider");
	}
	return context.redirect;
}
