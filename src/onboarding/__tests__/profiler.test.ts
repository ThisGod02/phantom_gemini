import { describe, expect, mock, test } from "bun:test";
import { type OwnerProfile, type SlackProfileClient, hasPersonalizationData, profileOwner } from "../profiler.ts";

function createMockClient(overrides?: {
	userInfo?: Partial<Awaited<ReturnType<SlackProfileClient["users"]["info"]>>>;
	teamInfo?: Partial<Awaited<ReturnType<SlackProfileClient["team"]["info"]>>>;
	conversations?: Partial<Awaited<ReturnType<SlackProfileClient["users"]["conversations"]>>>;
	userInfoError?: boolean;
	teamInfoError?: boolean;
	conversationsError?: boolean;
}): SlackProfileClient {
	return {
		users: {
			info: overrides?.userInfoError
				? mock(() => Promise.reject(new Error("missing_scope")))
				: mock(() =>
						Promise.resolve(
							overrides?.userInfo ?? {
								user: {
									real_name: "Cheema",
									name: "cheema",
									tz_label: "Pacific Daylight Time",
									is_admin: true,
									is_owner: true,
									profile: {
										title: "Founder",
										status_text: "Building Ghost OS",
									},
								},
							},
						),
					),
			conversations: overrides?.conversationsError
				? mock(() => Promise.reject(new Error("missing_scope")))
				: mock(() =>
						Promise.resolve(
							overrides?.conversations ?? {
								channels: [
									{ name: "engineering" },
									{ name: "infrastructure" },
									{ name: "deploys" },
									{ name: "general" },
								],
							},
						),
					),
		},
		team: {
			info: overrides?.teamInfoError
				? mock(() => Promise.reject(new Error("missing_scope")))
				: mock(() =>
						Promise.resolve(
							overrides?.teamInfo ?? {
								team: { name: "Ghostwright" },
							},
						),
					),
		},
	};
}

describe("profileOwner", () => {
	test("extracts full profile when all APIs succeed", async () => {
		const client = createMockClient();
		const profile = await profileOwner(client, "U0A9P3CC5EE");

		expect(profile.name).toBe("Cheema");
		expect(profile.title).toBe("Founder");
		expect(profile.timezone).toBe("Pacific Daylight Time");
		expect(profile.status).toBe("Building Ghost OS");
		expect(profile.isAdmin).toBe(true);
		expect(profile.isOwner).toBe(true);
		expect(profile.teamName).toBe("Ghostwright");
		expect(profile.channels).toEqual(["engineering", "infrastructure", "deploys", "general"]);
	});

	test("calls users.info with correct user ID", async () => {
		const client = createMockClient();
		await profileOwner(client, "U0A9P3CC5EE");

		expect(client.users.info).toHaveBeenCalledWith({ user: "U0A9P3CC5EE" });
	});

	test("calls users.conversations with correct params", async () => {
		const client = createMockClient();
		await profileOwner(client, "U0A9P3CC5EE");

		expect(client.users.conversations).toHaveBeenCalledWith({
			user: "U0A9P3CC5EE",
			types: "public_channel",
			exclude_archived: true,
			limit: 100,
		});
	});

	test("degrades gracefully when users.info fails", async () => {
		const client = createMockClient({ userInfoError: true });
		const profile = await profileOwner(client, "U_UNKNOWN");

		expect(profile.name).toBe("there");
		expect(profile.title).toBeNull();
		expect(profile.isAdmin).toBe(false);
		expect(profile.isOwner).toBe(false);
	});

	test("degrades gracefully when team.info fails", async () => {
		const client = createMockClient({ teamInfoError: true });
		const profile = await profileOwner(client, "U0A9P3CC5EE");

		expect(profile.name).toBe("Cheema");
		expect(profile.teamName).toBeNull();
	});

	test("degrades gracefully when users.conversations fails", async () => {
		const client = createMockClient({ conversationsError: true });
		const profile = await profileOwner(client, "U0A9P3CC5EE");

		expect(profile.name).toBe("Cheema");
		expect(profile.channels).toEqual([]);
	});

	test("handles all three APIs failing at once", async () => {
		const client = createMockClient({
			userInfoError: true,
			teamInfoError: true,
			conversationsError: true,
		});
		const profile = await profileOwner(client, "U_UNKNOWN");

		expect(profile.name).toBe("there");
		expect(profile.title).toBeNull();
		expect(profile.teamName).toBeNull();
		expect(profile.channels).toEqual([]);
	});

	test("uses username as fallback when real_name is missing", async () => {
		const client = createMockClient({
			userInfo: {
				user: {
					name: "cheema_handle",
					tz_label: "PST",
					is_admin: false,
					is_owner: false,
					profile: {},
				},
			},
		});
		const profile = await profileOwner(client, "U_TEST");

		expect(profile.name).toBe("cheema_handle");
	});

	test("returns null for empty title and status", async () => {
		const client = createMockClient({
			userInfo: {
				user: {
					real_name: "Test User",
					name: "test",
					profile: { title: "", status_text: "" },
				},
			},
		});
		const profile = await profileOwner(client, "U_TEST");

		expect(profile.title).toBeNull();
		expect(profile.status).toBeNull();
	});

	test("filters out channels with no name", async () => {
		const client = createMockClient({
			conversations: {
				channels: [{ name: "engineering" }, { name: undefined as unknown as string }, { name: "general" }],
			},
		});
		const profile = await profileOwner(client, "U_TEST");

		expect(profile.channels).toEqual(["engineering", "general"]);
	});
});

describe("hasPersonalizationData", () => {
	test("returns true when name is not default", () => {
		const profile: OwnerProfile = {
			name: "Cheema",
			title: null,
			timezone: null,
			status: null,
			isAdmin: false,
			isOwner: false,
			teamName: null,
			channels: [],
		};
		expect(hasPersonalizationData(profile)).toBe(true);
	});

	test("returns true when title is present", () => {
		const profile: OwnerProfile = {
			name: "there",
			title: "Founder",
			timezone: null,
			status: null,
			isAdmin: false,
			isOwner: false,
			teamName: null,
			channels: [],
		};
		expect(hasPersonalizationData(profile)).toBe(true);
	});

	test("returns true when channels are present", () => {
		const profile: OwnerProfile = {
			name: "there",
			title: null,
			timezone: null,
			status: null,
			isAdmin: false,
			isOwner: false,
			teamName: null,
			channels: ["general"],
		};
		expect(hasPersonalizationData(profile)).toBe(true);
	});

	test("returns false when no personalization data", () => {
		const profile: OwnerProfile = {
			name: "there",
			title: null,
			timezone: null,
			status: null,
			isAdmin: false,
			isOwner: false,
			teamName: null,
			channels: [],
		};
		expect(hasPersonalizationData(profile)).toBe(false);
	});
});
