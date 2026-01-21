import { getLog } from "../util/Logger";
import {
	createContext,
	type ReactElement,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

const log = getLog(import.meta);

// Default to 1 hour if not loaded from backend
const DEFAULT_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
// Check for timeout every 10 seconds
const CHECK_INTERVAL_MS = 10 * 1000;
// localStorage key for cross-tab sync
const LAST_ACTIVITY_KEY = "jolli_lastActivityTime";

interface SessionTimeoutContextType {
	/**
	 * Whether the session has expired due to inactivity
	 */
	isSessionExpired: boolean;
	/**
	 * Whether to show the session expired dialog
	 */
	showExpiredDialog: boolean;
	/**
	 * Reset the idle timer (called on user activity)
	 */
	resetIdleTimer: () => void;
	/**
	 * Handle session expiration (called by 401 handler)
	 */
	handleSessionExpired: () => void;
	/**
	 * Dismiss the expired dialog (after user acknowledges)
	 */
	dismissExpiredDialog: () => void;
	/**
	 * Set the idle timeout value (called after fetching from backend)
	 */
	setIdleTimeoutMs: (ms: number) => void;
	/**
	 * Set whether the session timeout tracking is enabled
	 */
	setEnabled: (enabled: boolean) => void;
}

const SessionTimeoutContext = createContext<SessionTimeoutContextType | undefined>(undefined);

interface SessionTimeoutProviderProps {
	children: ReactNode;
	/**
	 * Initial idle timeout in milliseconds (can be updated via setIdleTimeoutMs)
	 */
	initialIdleTimeoutMs?: number | undefined;
	/**
	 * Whether to enable the session timeout tracking (set to false when user is not logged in)
	 */
	enabled?: boolean;
}

export function SessionTimeoutProvider({
	children,
	initialIdleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
	// Rename the `enabled` prop to `initialEnabled` to avoid a naming conflict
	// with the `enabled` state variable. If the `enabled` prop is not provided,
	// it defaults to `true`.
	enabled: initialEnabled = true,
}: SessionTimeoutProviderProps): ReactElement {
	const [idleTimeoutMs, setIdleTimeoutMs] = useState(initialIdleTimeoutMs);
	const [isSessionExpired, setIsSessionExpired] = useState(false);
	const [showExpiredDialog, setShowExpiredDialog] = useState(false);
	const [enabled, setEnabled] = useState(initialEnabled);
	const lastActivityTimeRef = useRef(Date.now());

	// Reset the idle timer - called on user activity
	const resetIdleTimer = useCallback(() => {
		if (!isSessionExpired) {
			const now = Date.now();
			lastActivityTimeRef.current = now;
			// Sync across tabs via localStorage
			try {
				localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());
			} catch {
				/* v8 ignore next -- localStorage may be unavailable in private browsing or restricted contexts */
			}
		}
	}, [isSessionExpired]);

	// Handle session expiration
	const handleSessionExpired = useCallback(() => {
		log.info("Session expired");
		setIsSessionExpired(true);
		setShowExpiredDialog(true);
	}, []);

	// Dismiss the expired dialog
	const dismissExpiredDialog = useCallback(() => {
		setShowExpiredDialog(false);
	}, []);

	// Add event listeners for user activity
	useEffect(() => {
		if (!enabled || isSessionExpired) {
			return;
		}

		const events = ["click", "keydown", "mousedown", "touchstart"] as const;

		function handleActivity(): void {
			resetIdleTimer();
		}

		for (const event of events) {
			window.addEventListener(event, handleActivity);
		}

		return () => {
			for (const event of events) {
				window.removeEventListener(event, handleActivity);
			}
		};
	}, [enabled, isSessionExpired, resetIdleTimer]);

	// Listen for localStorage changes from other tabs
	useEffect(() => {
		if (!enabled) {
			return;
		}

		function handleStorageChange(e: StorageEvent): void {
			if (e.key === LAST_ACTIVITY_KEY && e.newValue) {
				const newTime = Number.parseInt(e.newValue, 10);
				if (!Number.isNaN(newTime)) {
					lastActivityTimeRef.current = newTime;
				}
			}
		}

		window.addEventListener("storage", handleStorageChange);
		return () => window.removeEventListener("storage", handleStorageChange);
	}, [enabled]);

	// Check for timeout periodically
	useEffect(() => {
		if (!enabled || isSessionExpired) {
			return;
		}

		const interval = setInterval(() => {
			const timeSinceActivity = Date.now() - lastActivityTimeRef.current;
			if (timeSinceActivity > idleTimeoutMs) {
				handleSessionExpired();
			}
		}, CHECK_INTERVAL_MS);

		return () => clearInterval(interval);
	}, [enabled, isSessionExpired, idleTimeoutMs, handleSessionExpired]);

	const value: SessionTimeoutContextType = {
		isSessionExpired,
		showExpiredDialog,
		resetIdleTimer,
		handleSessionExpired,
		dismissExpiredDialog,
		setIdleTimeoutMs,
		setEnabled,
	};

	return <SessionTimeoutContext.Provider value={value}>{children}</SessionTimeoutContext.Provider>;
}

export function useSessionTimeout(): SessionTimeoutContextType {
	const context = useContext(SessionTimeoutContext);
	if (context === undefined) {
		throw new Error("useSessionTimeout must be used within a SessionTimeoutProvider");
	}
	return context;
}
