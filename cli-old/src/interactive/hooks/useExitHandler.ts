import { useApp } from "ink";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";

export interface UseExitHandlerResult {
	shouldExit: boolean;
	setShouldExit: Dispatch<SetStateAction<boolean>>;
	isMountedRef: React.MutableRefObject<boolean>;
	abortControllerRef: React.MutableRefObject<AbortController | null>;
}

export function useExitHandler(onExit: () => void): UseExitHandlerResult {
	const { exit } = useApp();
	const [shouldExit, setShouldExit] = useState(false);
	const isMountedRef = useRef(true);
	const abortControllerRef = useRef<AbortController | null>(null);

	// Handle exit with delay to show goodbye message
	useEffect(() => {
		if (shouldExit) {
			const timer = setTimeout(() => {
				onExit();
				exit();
			}, 800);
			return () => clearTimeout(timer);
		}
	}, [shouldExit, exit, onExit]);

	// Cleanup: abort any pending requests when component unmounts
	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			abortControllerRef.current?.abort();
		};
	}, []);

	return {
		shouldExit,
		setShouldExit,
		isMountedRef,
		abortControllerRef,
	};
}
