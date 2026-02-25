import type { TemplateFile, ThemeConfig } from "../types.js";
import { escapeHtml, escapeJsString, sanitizeSiteName, sanitizeUrl, validateNumberRange } from "../utils/sanitize.js";

/** Discord SVG icon for chat link */
const DISCORD_ICON_SVG = `<svg width="24" height="24" fill="currentColor" viewBox="0 0 16 16"><path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612"/></svg>`;

/** Slack SVG icon for chat link */
const SLACK_ICON_SVG = `<svg width="24" height="24" fill="currentColor" viewBox="0 0 16 16"><path d="M3.362 10.11c0 .926-.756 1.681-1.681 1.681S0 11.036 0 10.111C0 9.186.756 8.43 1.68 8.43h1.682zm.846 0c0-.924.756-1.68 1.681-1.68s1.681.756 1.681 1.68v4.21c0 .924-.756 1.68-1.68 1.68a1.685 1.685 0 0 1-1.682-1.68zM5.89 3.362c-.926 0-1.682-.756-1.682-1.681S4.964 0 5.89 0s1.68.756 1.68 1.68v1.682zm0 .846c.924 0 1.68.756 1.68 1.681S6.814 7.57 5.89 7.57H1.68C.757 7.57 0 6.814 0 5.89c0-.926.756-1.682 1.68-1.682zm6.749 1.682c0-.926.755-1.682 1.68-1.682S16 4.964 16 5.889s-.756 1.681-1.68 1.681h-1.681zm-.848 0c0 .924-.755 1.68-1.68 1.68a1.685 1.685 0 0 1-1.681-1.68V1.68C8.43.757 9.186 0 10.11 0c.926 0 1.681.756 1.681 1.68zm-1.681 6.748c.926 0 1.682.756 1.682 1.681S11.036 16 10.11 16s-1.681-.756-1.681-1.68v-1.682h1.68zm0-.847c-.924 0-1.68-.755-1.68-1.68s.756-1.681 1.68-1.681h4.21c.924 0 1.68.756 1.68 1.68 0 .926-.756 1.681-1.68 1.681z"/></svg>`;

/**
 * Build footer text with mandatory "Powered by Jolli" branding
 */
function buildFooterText(config: ThemeConfig): string {
	if (config.footer) {
		return `${escapeHtml(config.footer)} · Powered by Jolli`;
	}
	return `${escapeHtml(config.logo)} · Powered by Jolli`;
}

/**
 * Build logo JSX for layout
 */
function buildLogoJsx(config: ThemeConfig): string {
	const escapedLogo = escapeHtml(config.logo);
	if (config.logoUrl) {
		const sanitizedUrl = sanitizeUrl(config.logoUrl);
		return `<img src="${sanitizedUrl}" alt="${escapedLogo}" style={{ height: 24 }} />`;
	}
	return `<span style={{ fontWeight: 700 }}>${escapedLogo}</span>`;
}

/**
 * Build chat link and icon props for Navbar
 */
function buildChatProps(config: ThemeConfig): string {
	if (!config.chatLink) {
		return "";
	}
	const sanitizedLink = sanitizeUrl(config.chatLink);
	const iconSvg = config.chatIcon === "slack" ? SLACK_ICON_SVG : DISCORD_ICON_SVG;
	return `
    chatLink="${sanitizedLink}"
    chatIcon={${iconSvg}}`;
}

/**
 * Generates the app/layout.tsx file with Auth0 authentication wrapper for Nextra 4.x App Router.
 * Integrates authentication with the standard Nextra docs layout.
 *
 * @param config Theme configuration
 * @param siteName Site name for default project link
 * @param allowedDomain Domain restriction for authentication
 */
export function generateAuthLayout(config: ThemeConfig, siteName: string, allowedDomain: string): TemplateFile {
	const footerText = buildFooterText(config);
	const logoJsx = buildLogoJsx(config);
	const chatProps = buildChatProps(config);
	const primaryHue = validateNumberRange(config.primaryHue, 0, 360, 212);
	const defaultTheme = config.defaultTheme ?? "system";
	const faviconLink = config.favicon ? `<link rel="icon" href="${sanitizeUrl(config.favicon)}" />` : "";
	const escapedLogo = escapeJsString(config.logo);
	const escapedTocTitle = escapeJsString(config.tocTitle ?? "On This Page");

	// Build project link with sanitization
	let projectLinkProp = "";
	if (config.projectLink) {
		projectLinkProp = `projectLink="${sanitizeUrl(config.projectLink)}"`;
	} else if (siteName) {
		const safeSiteName = sanitizeSiteName(siteName);
		projectLinkProp = `projectLink="https://github.com/Jolli-sample-repos/${safeSiteName}"`;
	}

	return {
		path: "app/layout.tsx",
		content: `'use client'

import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import { Auth0Provider } from '@auth0/auth0-react'
import { AuthGate } from '../lib/auth'
import 'nextra-theme-docs/style.css'
import { useEffect, useState, ReactNode } from 'react'

// Auth0 configuration - these would typically come from environment variables
const AUTH0_DOMAIN = process.env.NEXT_PUBLIC_AUTH0_DOMAIN || 'dev-example.us.auth0.com'
const AUTH0_CLIENT_ID = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID || 'your-client-id'

const navbar = (
  <Navbar
    logo={${logoJsx}}
    ${projectLinkProp}${chatProps}
  />
)

const footer = <Footer>${footerText}</Footer>

// Wrapper component to handle async pageMap
function DocsLayout({ children }: { children: ReactNode }) {
  const [pageMap, setPageMap] = useState<Awaited<ReturnType<typeof getPageMap>> | null>(null)

  useEffect(() => {
    getPageMap().then(setPageMap)
  }, [])

  if (!pageMap) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>
  }

  return (
    <Layout
      navbar={navbar}
      footer={footer}
      pageMap={pageMap}
      editLink={null}
      feedback={{ content: null }}
      toc={{ title: '${escapedTocTitle}' }}
      darkMode={true}
      nextThemes={{ defaultTheme: '${defaultTheme}' }}
    >
      {children}
    </Layout>
  )
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        <style>{\`:root { --nextra-primary-hue: ${primaryHue}deg; }\`}</style>
        ${faviconLink}
        <title>${escapedLogo}</title>
      </Head>
      <body>
        <Auth0Provider
          domain={AUTH0_DOMAIN}
          clientId={AUTH0_CLIENT_ID}
          authorizationParams={{
            redirect_uri: typeof window !== 'undefined' ? window.location.origin : '',
          }}
        >
          <AuthGate allowedDomain="${allowedDomain}">
            <DocsLayout>
              {children}
            </DocsLayout>
          </AuthGate>
        </Auth0Provider>
      </body>
    </html>
  )
}
`,
	};
}

/**
 * Generates the auth.tsx library file with authentication logic.
 * Used by both App Router (Nextra 4.x) layouts.
 */
export function generateAuthLib(allowedDomain: string): TemplateFile {
	return {
		path: "lib/auth.tsx",
		content: `'use client'

import { useAuth0 } from '@auth0/auth0-react'
import { useEffect, useState, ReactNode } from 'react'

interface AuthGateProps {
  children: ReactNode
  allowedDomain: string
}

export function AuthGate({ children, allowedDomain }: AuthGateProps) {
  const { isAuthenticated, isLoading, loginWithRedirect, user, error } = useAuth0()
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    if (isAuthenticated && user) {
      // Check if user's email domain matches the allowed domain
      const email = user.email || ''
      const userDomain = email.split('@')[1]

      if (userDomain === allowedDomain) {
        setIsAuthorized(true)
      } else {
        setIsAuthorized(false)
      }
    }
  }, [isAuthenticated, user, allowedDomain])

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div>Loading authentication...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div>Authentication error: {error.message}</div>
        <button onClick={() => loginWithRedirect()}>Try Again</button>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <h2>Authentication Required</h2>
        <p>This documentation site is restricted to @${allowedDomain} users.</p>
        <button
          onClick={() => loginWithRedirect()}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Sign In
        </button>
      </div>
    )
  }

  if (!isAuthorized) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <h2>Access Denied</h2>
        <p>This documentation site is only accessible to users with @${allowedDomain} email addresses.</p>
        <p>Your email: {user?.email}</p>
      </div>
    )
  }

  return <>{children}</>
}
`,
	};
}
