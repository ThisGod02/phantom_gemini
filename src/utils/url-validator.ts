import { isIP } from "node:net";

type ValidationResult = { safe: boolean; reason?: string };

/**
 * Validate that a URL is safe for server-side requests (SSRF prevention).
 * Blocks private IPs, localhost, cloud metadata endpoints, and link-local addresses.
 */
export function isSafeCallbackUrl(url: string): ValidationResult {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { safe: false, reason: "Invalid URL" };
	}

	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		return { safe: false, reason: `Unsupported protocol: ${parsed.protocol}` };
	}

	const hostname = parsed.hostname.toLowerCase();

	// Block localhost variants
	if (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1" ||
		hostname === "0.0.0.0" ||
		hostname === "[::1]"
	) {
		return { safe: false, reason: "Localhost addresses are not allowed" };
	}

	// Block link-local (169.254.x.x) - covers cloud metadata endpoint 169.254.169.254
	if (hostname.startsWith("169.254.")) {
		return { safe: false, reason: "Link-local addresses are not allowed" };
	}

	// Block well-known cloud metadata endpoints by hostname
	if (hostname === "metadata.google.internal" || hostname === "metadata.google.com") {
		return { safe: false, reason: "Cloud metadata endpoints are not allowed" };
	}

	// Check if hostname is an IP address and block private ranges
	const ipVersion = isIP(hostname);
	if (ipVersion > 0) {
		if (isPrivateIp(hostname)) {
			return { safe: false, reason: "Private IP addresses are not allowed" };
		}
	}

	return { safe: true };
}

function isPrivateIp(ip: string): boolean {
	const parts = ip.split(".").map(Number);
	if (parts.length === 4 && parts.every((p) => !Number.isNaN(p))) {
		// 10.0.0.0/8
		if (parts[0] === 10) return true;
		// 172.16.0.0/12
		if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
		// 192.168.0.0/16
		if (parts[0] === 192 && parts[1] === 168) return true;
		// 127.0.0.0/8 (loopback)
		if (parts[0] === 127) return true;
		// 169.254.0.0/16 (link-local, including cloud metadata)
		if (parts[0] === 169 && parts[1] === 254) return true;
		// 0.0.0.0/8
		if (parts[0] === 0) return true;
	}

	// IPv6 private ranges
	const lower = ip.toLowerCase();
	if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // Unique local
	if (lower.startsWith("fe80")) return true; // Link-local
	if (lower === "::1") return true; // Loopback

	return false;
}
