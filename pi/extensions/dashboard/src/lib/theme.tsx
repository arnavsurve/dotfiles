import { createContext, useContext, useEffect, useState } from "react";

type ThemeMode = "dark" | "light" | "system";

interface ThemeContextValue {
	mode: ThemeMode;
	setMode: (mode: ThemeMode) => void;
	resolved: "dark" | "light";
}

const ThemeContext = createContext<ThemeContextValue>({
	mode: "system",
	setMode: () => {},
	resolved: "dark",
});

export function useTheme() {
	return useContext(ThemeContext);
}

function getSystemTheme(): "dark" | "light" {
	if (typeof window === "undefined") return "dark";
	return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolve(mode: ThemeMode): "dark" | "light" {
	if (mode === "system") return getSystemTheme();
	return mode;
}

function applyTheme(resolved: "dark" | "light") {
	const html = document.documentElement;
	if (resolved === "light") {
		html.classList.add("light");
	} else {
		html.classList.remove("light");
	}
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [mode, setModeState] = useState<ThemeMode>(() => {
		if (typeof window === "undefined") return "system";
		return (localStorage.getItem("pi-dash-theme") as ThemeMode) ?? "system";
	});

	const [resolved, setResolved] = useState<"dark" | "light">(() => resolve(mode));

	function setMode(m: ThemeMode) {
		setModeState(m);
		localStorage.setItem("pi-dash-theme", m);
	}

	useEffect(() => {
		const r = resolve(mode);
		setResolved(r);
		applyTheme(r);
	}, [mode]);

	useEffect(() => {
		if (mode !== "system") return;
		const mq = window.matchMedia("(prefers-color-scheme: light)");
		const handler = () => {
			const r = resolve("system");
			setResolved(r);
			applyTheme(r);
		};
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, [mode]);

	return (
		<ThemeContext.Provider value={{ mode, setMode, resolved }}>
			{children}
		</ThemeContext.Provider>
	);
}
