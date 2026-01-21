import { type IntlayerConfig, Locales } from "intlayer";

const config: IntlayerConfig = {
	internationalization: {
		// Use only English locale in test mode for faster builds and simpler testing
		locales: process.env.VITEST ? [Locales.ENGLISH] : [Locales.ENGLISH, Locales.SPANISH],
		defaultLocale: Locales.ENGLISH,
	},
	content: {
		fileExtensions: [".content.ts", ".content.tsx"],
		baseDir: process.cwd(),
		contentDir: ["./src"],
	},
	routing: {
		mode: "prefix-no-default", // Default: prefix all locales except the default locale
		storage: [
			{
				type: "localStorage",
				name: "user-locale",
			},
			{
				type: "cookie",
				name: "user-locale",
				secure: true,
				sameSite: "strict",
				httpOnly: false,
			},
		],
		basePath: "",
	},
};

export default config;
