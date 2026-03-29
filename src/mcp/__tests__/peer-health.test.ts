import { afterEach, describe, expect, test } from "bun:test";
import { PeerHealthMonitor } from "../peer-health.ts";
import { PeerManager } from "../peers.ts";

describe("PeerHealthMonitor", () => {
	let monitor: PeerHealthMonitor | null = null;

	afterEach(() => {
		if (monitor) {
			monitor.stop();
			monitor = null;
		}
	});

	test("starts and stops cleanly with no peers", () => {
		const manager = new PeerManager();
		monitor = new PeerHealthMonitor(manager);

		monitor.start();
		expect(monitor.isRunning()).toBe(true);

		monitor.stop();
		expect(monitor.isRunning()).toBe(false);
	});

	test("getLastResults returns empty array initially", () => {
		const manager = new PeerManager();
		monitor = new PeerHealthMonitor(manager);

		expect(monitor.getLastResults()).toEqual([]);
	});

	test("getHealthSummary returns empty object initially", () => {
		const manager = new PeerManager();
		monitor = new PeerHealthMonitor(manager);

		expect(monitor.getHealthSummary()).toEqual({});
	});

	test("does not start twice", () => {
		const manager = new PeerManager();
		monitor = new PeerHealthMonitor(manager);

		monitor.start();
		monitor.start(); // Should be a no-op
		expect(monitor.isRunning()).toBe(true);
	});

	test("stop is idempotent", () => {
		const manager = new PeerManager();
		monitor = new PeerHealthMonitor(manager);

		monitor.stop(); // Should not throw even if not started
		expect(monitor.isRunning()).toBe(false);
	});

	test("accepts custom config", () => {
		const manager = new PeerManager();
		monitor = new PeerHealthMonitor(manager, { intervalMs: 5000, timeoutMs: 2000 });

		expect(monitor.isRunning()).toBe(false);
		monitor.start();
		expect(monitor.isRunning()).toBe(true);
	});

	test("runs health check with unreachable peer", async () => {
		const manager = new PeerManager();
		manager.addPeer("unreachable", {
			url: "https://localhost:59999/mcp",
			token: "token",
			enabled: true,
		});

		monitor = new PeerHealthMonitor(manager, { intervalMs: 60000, timeoutMs: 1000 });

		// Manually wait for initial check to complete
		monitor.start();
		// Wait a bit for the async initial check
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const results = monitor.getLastResults();
		expect(results).toHaveLength(1);
		expect(results[0].name).toBe("unreachable");
		expect(results[0].healthy).toBe(false);

		const summary = monitor.getHealthSummary();
		expect(summary.unreachable).toBeDefined();
		expect(summary.unreachable.healthy).toBe(false);
	});
});
