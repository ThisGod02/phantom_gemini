import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { PeerManager, checkPeerHealth } from "../peers.ts";

describe("PeerManager", () => {
	test("starts with zero peers", () => {
		const manager = new PeerManager();
		expect(manager.count()).toBe(0);
	});

	test("addPeer adds a peer", () => {
		const manager = new PeerManager();
		manager.addPeer("swe-phantom", {
			url: "https://swe.ghostwright.dev/mcp",
			token: "test-token",
			description: "SWE Phantom",
			enabled: true,
		});

		expect(manager.count()).toBe(1);
		expect(manager.has("swe-phantom")).toBe(true);
	});

	test("removePeer removes a peer", () => {
		const manager = new PeerManager();
		manager.addPeer("temp", {
			url: "https://temp.dev/mcp",
			token: "token",
			enabled: true,
		});
		expect(manager.removePeer("temp")).toBe(true);
		expect(manager.has("temp")).toBe(false);
		expect(manager.count()).toBe(0);
	});

	test("removePeer returns false for unknown peer", () => {
		const manager = new PeerManager();
		expect(manager.removePeer("nonexistent")).toBe(false);
	});

	test("getAllPeers returns peer info", () => {
		const manager = new PeerManager();
		manager.addPeer("swe", {
			url: "https://swe.dev/mcp",
			token: "token-swe",
			description: "SWE",
			enabled: true,
		});
		manager.addPeer("data", {
			url: "https://data.dev/mcp",
			token: "token-data",
			description: "Data",
			enabled: true,
		});

		const peers = manager.getAllPeers();
		expect(peers).toHaveLength(2);
		expect(peers[0].name).toBe("swe");
		expect(peers[1].name).toBe("data");
	});

	test("getMcpServerConfigs returns proper config format", () => {
		const manager = new PeerManager();
		manager.addPeer("swe", {
			url: "https://swe.dev/mcp",
			token: "my-secret-token",
			description: "SWE",
			enabled: true,
		});

		const configs = manager.getMcpServerConfigs();
		expect(configs.swe).toBeDefined();
		expect(configs.swe.type).toBe("url");
		expect(configs.swe.url).toBe("https://swe.dev/mcp");
		expect(configs.swe.headers.Authorization).toBe("Bearer my-secret-token");
	});

	test("getMcpServerConfigs skips disabled peers", () => {
		const manager = new PeerManager();
		manager.addPeer("enabled", {
			url: "https://enabled.dev/mcp",
			token: "token",
			enabled: true,
		});
		manager.addPeer("disabled", {
			url: "https://disabled.dev/mcp",
			token: "token",
			enabled: false,
		});

		const configs = manager.getMcpServerConfigs();
		expect(Object.keys(configs)).toHaveLength(1);
		expect(configs.enabled).toBeDefined();
		expect(configs.disabled).toBeUndefined();
	});

	test("getPeer returns config for known peer", () => {
		const manager = new PeerManager();
		manager.addPeer("known", {
			url: "https://known.dev/mcp",
			token: "known-token",
			description: "Known peer",
			enabled: true,
		});

		const config = manager.getPeer("known");
		expect(config).toBeDefined();
		expect(config?.url).toBe("https://known.dev/mcp");
	});

	test("getPeer returns undefined for unknown peer", () => {
		const manager = new PeerManager();
		expect(manager.getPeer("unknown")).toBeUndefined();
	});

	test("loadFromConfig loads peers from YAML file", () => {
		const tmpDir = join(import.meta.dir, "tmp-peers-config-test");
		if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

		const configPath = join(tmpDir, "phantom.yaml");
		writeFileSync(
			configPath,
			stringify({
				name: "test",
				port: 3100,
				role: "swe",
				model: "claude-opus-4-6",
				peers: {
					"swe-peer": {
						url: "https://swe.dev/mcp",
						token: "swe-token",
						description: "SWE peer",
						enabled: true,
					},
					"disabled-peer": {
						url: "https://disabled.dev/mcp",
						token: "token",
						enabled: false,
					},
				},
			}),
		);

		const manager = new PeerManager();
		manager.loadFromConfig(configPath);

		// Only the enabled peer should be loaded
		expect(manager.count()).toBe(1);
		expect(manager.has("swe-peer")).toBe(true);
		expect(manager.has("disabled-peer")).toBe(false);

		if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
	});

	test("loadFromConfig handles missing file gracefully", () => {
		const manager = new PeerManager();
		manager.loadFromConfig("/nonexistent/phantom.yaml");
		expect(manager.count()).toBe(0);
	});

	test("addPeer validates URL", () => {
		const manager = new PeerManager();
		expect(() =>
			manager.addPeer("bad", {
				url: "not-a-url",
				token: "token",
				enabled: true,
			}),
		).toThrow();
	});
});

describe("checkPeerHealth", () => {
	test("returns unhealthy for unreachable peer", async () => {
		const result = await checkPeerHealth(
			"unreachable",
			{
				url: "https://localhost:59999/mcp",
				token: "token",
				enabled: true,
			},
			1000,
		);

		expect(result.name).toBe("unreachable");
		expect(result.healthy).toBe(false);
		expect(result.error).toBeDefined();
	});
});
