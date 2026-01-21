export default {
	plugins: {
		"@tailwindcss/postcss": {
			// Content paths - tells Tailwind which files to scan
			content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
			// Dark mode strategy
			darkMode: "class",
		},
	},
};
