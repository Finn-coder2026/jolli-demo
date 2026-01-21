import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	devIndicators: false,
	reactStrictMode: true,
	output: "standalone",
	// Sequelize, pg, and pino modules need to be treated as external packages
	// to avoid bundling issues with dynamic requires and Node.js stream modules
	serverExternalPackages: [
		"sequelize",
		"pg",
		"pg-hstore",
		"pino",
		"pino-pretty",
		"pino-roll",
		"pino-abstract-transport",
		"split2",
	],
};

export default nextConfig;
