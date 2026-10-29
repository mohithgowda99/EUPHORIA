import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createActivityStore } from "../src/activity/activity";
import { createAgentProfileStore } from "../src/agents/profile-store";
import type { AgentActor } from "../src/agents/profile-types";
import { createChannelStore } from "../src/channels/routes";
import { createThreadIdentity } from "../src/channels/thread-identity";
import { createDatabase } from "../src/db/client";
import {
  agentProfiles,
  agents,
  channels,
  intelligenceChannelMappings,
  managedAgentSessionLinks,
  managedRoutineInvocations,
  routineRuns,
  routines,
  users,
} from "../src/db/schema";
import {
  createManagedRoutineBridge,
  type ManagedAutomationProvider,
} from "../src/routines/managed-routine-bridge";
import {
  createRoutineStore,
  MAX_ENABLED_ROUTINES,
  MAX_INSTRUCTION_CODE_POINTS,
  MAX_RUN_ERROR,
  RoutineNotFoundError,
  RoutineRefusedError,
} from "../src/routines/store";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const databaseUrl = testDatabaseUrl();
const database = createDatabase(databaseUrl, TEST_POOL);
const profileStore = createAgentProfileStore(
  database,
  new URL("https://managed.example.test/ag-ui"),
);
const channelStore = createChannelStore(
  database,
  profileStore,
  createThreadIdentity("test-deployment"),
);
const store = createRoutineStore(database);

const testPrefix = `routines-store-${randomUUID()}`;
const createdUserIds: string[] = [];
const createdAgentIds: string[] = [];
const createdChannelIds: string[] = [];

/** Every day at 09:00 UTC: comfortably above the floor and stable to describe. */
const DAILY = "0 9 * * *";

afterEach(async () => {
  // Routines cascade from both the owner and the agent, but they are cleared first so a failure
  // part-way through cleanup leaves nothing pointing at rows this file is about to delete.
  for (const userId of createdUserIds) {
    await database.delete(routines).where(eq(routines.ownerUserId, userId));
  }
  for (const channelId of createdChannelIds.splice(0)) {
    await database
      .delete(intelligenceChannelMappings)
      .where(eq(intelligenceChannelMappings.channelId, channelId));
    await database.delete(channels).where(eq(channels.id, channelId));
  }
  for (const agentId of createdAgentIds.splice(0)) {
    await database
      .delete(agentProfiles)
      .where(eq(agentProfiles.agentId, agentId));
    await database.delete(agents).where(eq(agents.id, agentId));
  }
  for (const userId of createdUserIds.splice(0)) {
    await database.delete(users).where(eq(users.id, userId));
  }
});

afterAll(async () => {
  await database.$client.close();
});

async function createUser(): Promise<AgentActor> {
  const id = `${testPrefix}-user-${randomUUID()}`;
  await database.insert(users).values({
    id,
    email: `${id}@example.test`,
    name: "Routine Store Test User",
  });
  createdUserIds.push(id);
  return { id, role: "user" };
}

async function createAgent(owner: AgentActor, name = "Expense Manager") {
  const profile = await profileStore.create(owner, {
    name,
    title: "Finance Operations",
    roleDescription: "Review receipts.",
    visibility: "private",
  });
  createdAgentIds.push(profile.id);
  return profile.id;
}

async function createChannel(owner: AgentActor, agentIds: string[]) {
  const channel = await channelStore.create(owner, agentIds);
  createdChannelIds.push(channel.id);
  return channel;
}

/** A person, a Bot and the one channel they share: the ordinary starting point. */
async function setUp() {
  const owner = await createUser();
  const agentId = await createAgent(owner);
  const channel = await createChannel(owner, [agentId]);
  return { owner, agentId, channel };
}

/**
 * A routine is one person's standing instruction, so every method takes the owner and every
 * statement is guarded by it. A routine belonging to somebody else has to be indistinguishable from
 * one that was never created — the `setPinned` rule — because anything else tells a stranger which
 * ids exist.
 */
describe("owner-guarding", () => {
  test("another person cannot update, remove or switch off a routine", async () => {
    const { owner, agentId, channel } = await setUp();
    const stranger = await createUser();
    const routine = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Summarise yesterday's receipts.",
      cron: DAILY,
    });

    await expect(
      store.update(stranger.id, routine.id, { instruction: "Do my bidding." }),
    ).rejects.toBeInstanceOf(RoutineNotFoundError);
    await expect(store.remove(stranger.id, routine.id)).rejects.toBeInstanceOf(
      RoutineNotFoundError,
    );
    await expect(
      store.setEnabled(stranger.id, routine.id, false),
    ).rejects.toBeInstanceOf(RoutineNotFoundError);

    const [mine] = await store.listFor(owner.id);
    expect(mine?.instruction).toBe("Summarise yesterday's receipts.");
    expect(mine?.enabled).toBe(true);
  });

  test("a stranger's list does not contain the routine", async () => {
    const { owner, agentId, channel } = await setUp();
    const stranger = await createUser();
    await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Summarise yesterday's receipts.",
      cron: DAILY,
    });

    expect(await store.listFor(stranger.id)).toEqual([]);
  });
});

describe("what the schedule has to be", () => {
  test("refuses a cron under the floor, in the schedule's own words", async () => {
    const { owner, agentId, channel } = await setUp();

    // Every minute. The sentence is the schedule module's; the store only passes it along, because
    // a model recovers from prose and this is the prose that says what to try instead.
    await expect(
      store.create({
        ownerUserId: owner.id,
        agentId,
        channelId: channel.id,
        instruction: "Check my inbox.",
        cron: "* * * * *",
      }),
    ).rejects.toThrow(/15 minutes/);
    await expect(
      store.create({
        ownerUserId: owner.id,
        agentId,
        channelId: channel.id,
        instruction: "Check my inbox.",
        cron: "* * * * *",
      }),
    ).rejects.toBeInstanceOf(RoutineRefusedError);
  });

  test("refuses an instruction over the cap and accepts one at it", async () => {
    const { owner, agentId, channel } = await setUp();

    const atTheCap = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "x".repeat(MAX_INSTRUCTION_CODE_POINTS),
      cron: DAILY,
    });
    expect(Array.from(atTheCap.instruction)).toHaveLength(
      MAX_INSTRUCTION_CODE_POINTS,
    );

    await expect(
      store.create({
        ownerUserId: owner.id,
        agentId,
        channelId: channel.id,
        instruction: "x".repeat(MAX_INSTRUCTION_CODE_POINTS + 1),
        cron: DAILY,
      }),
    ).rejects.toBeInstanceOf(RoutineRefusedError);
  });

  test("refuses a blank instruction with the sentence a model is meant to read", async () => {
    const { owner, agentId, channel } = await setUp();

    const failure = await store
      .create({
        ownerUserId: owner.id,
        agentId,
        channelId: channel.id,
        instruction: "   ",
        cron: DAILY,
      })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(RoutineRefusedError);
    expect((failure as Error).message).toBe(
      "A routine needs an instruction to carry out.",
    );
  });
});

/**
 * The cap is a constant with a reason: every enabled routine is a headless turn somebody's Bot will
 * take without being watched, and a model that can be talked into creating them one at a time can be
 * talked into creating a hundred. It counts what is switched ON, so switching one off makes room.
 */
describe("how many a person may have switched on", () => {
  test("refuses the one past the cap, and accepts it once another is off", async () => {
    const { owner, agentId, channel } = await setUp();
    const created: string[] = [];
    for (let index = 0; index < MAX_ENABLED_ROUTINES; index += 1) {
      const routine = await store.create({
        ownerUserId: owner.id,
        agentId,
        channelId: channel.id,
        instruction: `Routine ${index}`,
        cron: DAILY,
      });
      created.push(routine.id);
    }

    await expect(
      store.create({
        ownerUserId: owner.id,
        agentId,
        channelId: channel.id,
        instruction: "One too many.",
        cron: DAILY,
      }),
    ).rejects.toBeInstanceOf(RoutineRefusedError);

    await store.setEnabled(owner.id, created[0] as string, false);

    const room = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Now there is room.",
      cron: DAILY,
    });
    expect(room.enabled).toBe(true);

    // And switching the disabled one back on is refused for the same reason.
    await expect(
      store.setEnabled(owner.id, created[0] as string, true),
    ).rejects.toBeInstanceOf(RoutineRefusedError);
  });

  /**
   * The cap has to hold under concurrency, not just in sequence. A bare count-then-insert lets two
   * creates racing at 19 both count 19 and both insert — the person holds 21 — which is why the
   * store serializes the count and the write per owner under an advisory lock. This drives the race
   * for real: two creates in flight at once on separate pooled connections.
   */
  test("two creates racing at the cap admit exactly one", async () => {
    const { owner, agentId, channel } = await setUp();
    for (let index = 0; index < MAX_ENABLED_ROUTINES - 1; index += 1) {
      await store.create({
        ownerUserId: owner.id,
        agentId,
        channelId: channel.id,
        instruction: `Routine ${index}`,
        cron: DAILY,
      });
    }

    const outcomes = await Promise.allSettled([
      store.create({
        ownerUserId: owner.id,
        agentId,
        channelId: channel.id,
        instruction: "Racer one.",
        cron: DAILY,
      }),
      store.create({
        ownerUserId: owner.id,
        agentId,
        channelId: channel.id,
        instruction: "Racer two.",
        cron: DAILY,
      }),
    ]);

    const refused = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    ) as PromiseRejectedResult[];
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(refused).toHaveLength(1);
    // The loser gets the friendly sentence, not a constraint violation: the same refusal a
    // sequential twenty-first create gets.
    expect(refused[0]?.reason).toBeInstanceOf(RoutineRefusedError);

    const enabled = (await store.listFor(owner.id)).filter(
      (summary) => summary.enabled,
    );
    expect(enabled).toHaveLength(MAX_ENABLED_ROUTINES);
  });
});

/**
 * The conversation's channel is not reachable at the tool layer, so the store resolves it. All four
 * branches matter: the wrong channel is a place a Bot could post something private, and the two
 * ambiguous branches are refusals a model has to be able to recover from in language.
 */
describe("resolving the channel to post into", () => {
  test("accepts a channel the owner and the agent share", async () => {
    const { owner, agentId, channel } = await setUp();

    const routine = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Post the summary here.",
      cron: DAILY,
    });

    expect(routine.channelId).toBe(channel.id);
  });

  test("refuses a channel the owner is not in", async () => {
    const { owner, agentId } = await setUp();
    const stranger = await createUser();
    const strangerAgentId = await createAgent(stranger, "Their Bot");
    const theirChannel = await createChannel(stranger, [strangerAgentId]);

    await expect(
      store.create({
        ownerUserId: owner.id,
        agentId,
        channelId: theirChannel.id,
        instruction: "Post into somebody else's channel.",
        cron: DAILY,
      }),
    ).rejects.toThrow(/both in/);
  });

  test("refuses a channel this agent is not in", async () => {
    const { owner, channel } = await setUp();
    const otherAgentId = await createAgent(owner, "Unrelated Bot");

    await expect(
      store.create({
        ownerUserId: owner.id,
        agentId: otherAgentId,
        channelId: channel.id,
        instruction: "Post where I do not live.",
        cron: DAILY,
      }),
    ).rejects.toBeInstanceOf(RoutineRefusedError);
  });

  test("uses the only shared channel when none was named", async () => {
    const { owner, agentId, channel } = await setUp();

    const routine = await store.create({
      ownerUserId: owner.id,
      agentId,
      instruction: "Wherever we talk.",
      cron: DAILY,
    });

    expect(routine.channelId).toBe(channel.id);
  });

  test("refuses with no channel at all, and says to start one", async () => {
    const owner = await createUser();
    const agentId = await createAgent(owner);

    await expect(
      store.create({
        ownerUserId: owner.id,
        agentId,
        instruction: "Nowhere to put this.",
        cron: DAILY,
      }),
    ).rejects.toThrow(/Start one/);
  });

  test("refuses ambiguity by naming the channels, so a model can ask", async () => {
    const { owner, agentId, channel } = await setUp();
    const secondAgentId = await createAgent(owner, "Second Bot");
    const other = await createChannel(owner, [agentId, secondAgentId]);

    const failure = await store
      .create({
        ownerUserId: owner.id,
        agentId,
        instruction: "Which one?",
        cron: DAILY,
      })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(RoutineRefusedError);
    const message = (failure as Error).message;
    expect(message).toContain(channel.name);
    expect(message).toContain(other.name);
    expect(message).toContain("Say which one.");
  });

  test("names at most five channels before it gives up and says 'and others'", async () => {
    const owner = await createUser();
    const agentId = await createAgent(owner);
    const sharedChannels = [];
    for (let index = 0; index < 6; index += 1) {
      sharedChannels.push(await createChannel(owner, [agentId]));
    }

    const failure = await store
      .create({
        ownerUserId: owner.id,
        agentId,
        instruction: "Which one?",
        cron: DAILY,
      })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(RoutineRefusedError);
    const message = (failure as Error).message;
    expect(message).toContain(", and others");
    // All six channels share one agent, so they share one name; the cap names five of them, not
    // six, so that one name appears exactly five times rather than six.
    const name = sharedChannels[0]?.name as string;
    const occurrences = message.split(name).length - 1;
    expect(occurrences).toBe(5);
  });

  test("names a colliding channel by id when its name cannot tell it apart from another", async () => {
    // The finding this guards: a real account had six channels all named "General Assistant" with
    // the same Bot, and the refusal read "General Assistant, General Assistant, … and others" —
    // circular, because the person cannot answer it and the model cannot map an answer back to a
    // channelId. Two same-named channels plus one distinctly-named one is the smallest case that
    // proves the fix: the colliding pair gets ids, the distinct one stays bare.
    const owner = await createUser();
    const agentId = await createAgent(owner);
    const twinOne = await createChannel(owner, [agentId]);
    const twinTwo = await createChannel(owner, [agentId]);
    // channelStore.create names channels itself, so force the collision directly rather than
    // trusting default naming to produce two identical names.
    await database
      .update(channels)
      .set({ name: "General Assistant" })
      .where(eq(channels.id, twinOne.id));
    await database
      .update(channels)
      .set({ name: "General Assistant" })
      .where(eq(channels.id, twinTwo.id));
    const distinct = await createChannel(owner, [agentId]);
    await database
      .update(channels)
      .set({ name: "Marketing Bot" })
      .where(eq(channels.id, distinct.id));

    const failure = await store
      .create({
        ownerUserId: owner.id,
        agentId,
        instruction: "Which one?",
        cron: DAILY,
      })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(RoutineRefusedError);
    const message = (failure as Error).message;
    // Both same-named channels are named by their full id, because that is the one thing the model
    // can pass back as `channelId` when the names alone cannot disambiguate.
    expect(message).toContain(twinOne.id);
    expect(message).toContain(twinTwo.id);
    // The distinctly-named channel is not: its name alone already disambiguates it, and appending
    // an id it does not need would make the common, non-colliding case's sentence longer for
    // nothing.
    expect(message).toContain("Marketing Bot");
    expect(message).not.toContain(`Marketing Bot (${distinct.id})`);
  });
});

describe("reading a person's routines", () => {
  test("says the schedule in words and never in cron", async () => {
    const { owner, agentId, channel } = await setUp();
    await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Summarise the day.",
      cron: DAILY,
      timezone: "Europe/Madrid",
    });

    const [summary] = await store.listFor(owner.id);

    expect(summary?.schedule).toBe("Every day at 09:00");
    expect(summary?.schedule).not.toContain("*");
    expect(summary?.timezone).toBe("Europe/Madrid");
    expect(summary?.channelName).toBe(channel.name);
    expect(summary?.channelDeleted).toBe(false);
    expect(summary?.nextRunAt).toBeInstanceOf(Date);
    // A routine that has never fired has no run row, so the join has nothing to report.
    expect(summary?.lastRun).toBeNull();
  });

  test("says a step schedule in words too, never in cron", async () => {
    const { owner, agentId, channel } = await setUp();
    await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Check in often.",
      cron: "*/20 * * * *",
    });

    const [summary] = await store.listFor(owner.id);

    expect(summary?.schedule).not.toContain("*");
  });

  test("puts the newest first", async () => {
    const { owner, agentId, channel } = await setUp();
    const first = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "First.",
      cron: DAILY,
    });
    const second = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Second.",
      cron: DAILY,
    });

    expect((await store.listFor(owner.id)).map((row) => row.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  test("keeps a routine whose channel was deleted and reports it as gone", async () => {
    // The whole reason `routines.channel_id` is not a foreign key: a cascade here would delete the
    // person's standing instruction silently, and they would find out by it never running again.
    const { owner, agentId, channel } = await setUp();
    await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Post into a channel that is about to go.",
      cron: DAILY,
    });

    await channelStore.softDelete(owner, channel.id);

    const [summary] = await store.listFor(owner.id);
    expect(summary?.channelId).toBe(channel.id);
    expect(summary?.channelDeleted).toBe(true);
  });
});

describe("changing a routine", () => {
  test("recomputes the next run when the cron changes", async () => {
    const { owner, agentId, channel } = await setUp();
    const routine = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Summarise the day.",
      cron: DAILY,
    });

    const updated = await store.update(owner.id, routine.id, {
      cron: "30 21 * * *",
    });

    expect(updated.cron).toBe("30 21 * * *");
    expect(updated.nextRunAt.getTime()).not.toBe(routine.nextRunAt.getTime());
  });

  test("recomputes the next run when only the timezone changes, and refuses an unknown zone", async () => {
    const { owner, agentId, channel } = await setUp();
    const routine = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Summarise the day.",
      cron: DAILY,
    });

    const updated = await store.update(owner.id, routine.id, {
      timezone: "Asia/Tokyo",
    });

    expect(updated.timezone).toBe("Asia/Tokyo");
    expect(updated.nextRunAt.getTime()).not.toBe(routine.nextRunAt.getTime());

    await expect(
      store.update(owner.id, routine.id, { timezone: "Mars/Olympus" }),
    ).rejects.toBeInstanceOf(RoutineRefusedError);

    // The refusal must not have partially applied: the row still carries the timezone from the
    // update that succeeded, not the rejected "Mars/Olympus".
    const [summary] = await store.listFor(owner.id);
    expect(summary?.timezone).toBe("Asia/Tokyo");
  });

  test("leaves the next run alone when only the instruction changes", async () => {
    const { owner, agentId, channel } = await setUp();
    const routine = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Summarise the day.",
      cron: DAILY,
    });

    const updated = await store.update(owner.id, routine.id, {
      instruction: "Summarise the week.",
    });

    expect(updated.instruction).toBe("Summarise the week.");
    expect(updated.nextRunAt.getTime()).toBe(routine.nextRunAt.getTime());
  });

  test("re-validates only what was supplied", async () => {
    const { owner, agentId, channel } = await setUp();
    const routine = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Summarise the day.",
      cron: DAILY,
    });

    await expect(
      store.update(owner.id, routine.id, { cron: "* * * * *" }),
    ).rejects.toBeInstanceOf(RoutineRefusedError);
    await expect(
      store.update(owner.id, routine.id, {
        instruction: "x".repeat(MAX_INSTRUCTION_CODE_POINTS + 1),
      }),
    ).rejects.toBeInstanceOf(RoutineRefusedError);
    // Refused writes changed nothing.
    const [summary] = await store.listFor(owner.id);
    expect(summary?.instruction).toBe("Summarise the day.");
    expect(summary?.schedule).toBe("Every day at 09:00");
  });

  test("re-resolves the channel when a new one is named", async () => {
    const { owner, agentId, channel } = await setUp();
    const secondAgentId = await createAgent(owner, "Second Bot");
    const other = await createChannel(owner, [agentId, secondAgentId]);
    const routine = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Summarise the day.",
      cron: DAILY,
    });

    const moved = await store.update(owner.id, routine.id, {
      channelId: other.id,
    });
    expect(moved.channelId).toBe(other.id);

    const stranger = await createUser();
    const strangerAgentId = await createAgent(stranger, "Their Bot");
    const theirChannel = await createChannel(stranger, [strangerAgentId]);
    await expect(
      store.update(owner.id, routine.id, { channelId: theirChannel.id }),
    ).rejects.toBeInstanceOf(RoutineRefusedError);
  });

  test("switching off and on again recomputes the next run", async () => {
    const { owner, agentId, channel } = await setUp();
    const routine = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Summarise the day.",
      cron: DAILY,
    });
    // A routine switched off for a month has a next run a month in the past. Enabling it must not
    // hand the sweep a firing that was due in June. Forcing the stamp into the past makes that
    // stale state real rather than assumed: without this, `nextRunAt > now` would already have
    // been true before the disable, and deleting the recompute branch would leave this green.
    await store.setEnabled(owner.id, routine.id, false);
    const stale = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await database
      .update(routines)
      .set({ nextRunAt: stale })
      .where(eq(routines.id, routine.id));

    const enabled = await store.update(owner.id, routine.id, { enabled: true });

    expect(enabled.enabled).toBe(true);
    expect(enabled.nextRunAt.getTime()).toBeGreaterThan(Date.now());

    // The mirror image: an instruction-only change on an already-enabled routine must not recompute,
    // even when the stored stamp is one that recomputing would obviously move.
    await database
      .update(routines)
      .set({ nextRunAt: stale })
      .where(eq(routines.id, routine.id));

    const untouched = await store.update(owner.id, routine.id, {
      instruction: "Summarise the week instead.",
    });

    expect(untouched.nextRunAt.getTime()).toBe(stale.getTime());
  });

  test("removing one is a hard delete, and only once", async () => {
    const { owner, agentId, channel } = await setUp();
    const routine = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Summarise the day.",
      cron: DAILY,
    });

    await store.remove(owner.id, routine.id);

    expect(await store.listFor(owner.id)).toEqual([]);
    await expect(store.remove(owner.id, routine.id)).rejects.toBeInstanceOf(
      RoutineNotFoundError,
    );
  });
});

/*
 * ---------------------------------------------------------------------------------------------
 * The sweep's half. Nothing below is asked a question by a person, and everything below is about
 * two things happening at once: several replicas reading the same due row in the same second.
 *
 * NO CLAIM OR LEASE SEMANTICS ARE TESTED HERE. Firing mechanics live in the shared `work_items`
 * queue, and `server/tests/work-queue.integration.test.ts` owns `for update skip locked`, leases
 * on the database's clock, and the attempt count. What this file tests is the routines table's own
 * compare-and-set on `next_run_at`, which is a different guarantee: the clock moves once.
 */

/**
 * The create path always computes a future stamp, so a due-in-the-past row has to be written
 * directly — the same direct write the staleness test above uses. The stamps are deliberately
 * ancient: `dueRoutines` is not owner-scoped, so a test that asserts on ordering has to be sure
 * its own rows sort ahead of anything else in the database.
 */
async function makeDueAt(routineId: string, nextRunAt: Date): Promise<Date> {
  await database
    .update(routines)
    .set({ nextRunAt })
    .where(eq(routines.id, routineId));
  const [row] = await database
    .select({ nextRunAt: routines.nextRunAt })
    .from(routines)
    .where(eq(routines.id, routineId))
    .limit(1);
  // Read back rather than trusting the Date we wrote: the comparison the CAS makes is Postgres's.
  return row?.nextRunAt as Date;
}

async function readRoutine(routineId: string) {
  const [row] = await database
    .select()
    .from(routines)
    .where(eq(routines.id, routineId))
    .limit(1);
  return row;
}

async function makeRoutine(instruction = "Summarise the day.") {
  const { owner, agentId, channel } = await setUp();
  const routine = await store.create({
    ownerUserId: owner.id,
    agentId,
    channelId: channel.id,
    instruction,
    cron: DAILY,
  });
  return { owner, agentId, channel, routine };
}

describe("moving a routine's clock", () => {
  test("two sweeps racing on the same stamp advance it exactly once", async () => {
    const { routine } = await makeRoutine();
    const from = await makeDueAt(routine.id, new Date("2001-03-04T09:00:00Z"));

    const outcomes = await Promise.all([
      store.advanceNextRun(routine.id, from),
      store.advanceNextRun(routine.id, from),
    ]);

    expect(outcomes.filter((won) => won)).toHaveLength(1);
    expect(outcomes.filter((won) => !won)).toHaveLength(1);

    // The loser's re-read sees the advanced value: whichever call lost, the clock has moved on and
    // nothing is left holding the stamp it was asked to move from.
    const after = await readRoutine(routine.id);
    expect(after?.nextRunAt.getTime()).toBeGreaterThan(from.getTime());
  });

  test("a stale `from` returns false and moves nothing", async () => {
    const { routine } = await makeRoutine();
    const from = await makeDueAt(routine.id, new Date("2001-03-04T09:00:00Z"));

    const moved = await store.advanceNextRun(
      routine.id,
      new Date("2001-03-03T09:00:00Z"),
    );

    expect(moved).toBe(false);
    const after = await readRoutine(routine.id);
    expect(after?.nextRunAt.getTime()).toBe(from.getTime());
    expect(after?.lastRunAt).toBeNull();
  });

  test("an explicit computeFrom drains a stale clock current in one move, CAS intact", async () => {
    const { routine } = await makeRoutine();
    const from = await makeDueAt(routine.id, new Date("2001-01-01T09:00:00Z"));

    // The sweep's stale-backlog call: compare against the month-old stamp it read, but land on the
    // occurrence after the moment the sweep is standing in — not one day along a 31-day drain.
    const moved = await store.advanceNextRun(
      routine.id,
      from,
      new Date("2001-02-01T10:00:00Z"),
    );

    expect(moved).toBe(true);
    const after = await readRoutine(routine.id);
    expect(after?.nextRunAt.toISOString()).toBe("2001-02-02T09:00:00.000Z");
    // The bookmark still records the stamp the CAS compared against.
    expect(after?.lastRunAt?.getTime()).toBe(from.getTime());

    // And the CAS still guards: a second call holding the drained stamp moves nothing.
    expect(
      await store.advanceNextRun(
        routine.id,
        from,
        new Date("2001-03-01T10:00:00Z"),
      ),
    ).toBe(false);
  });

  test("advancing stamps last_run_at with the `from` it was given", async () => {
    const { routine } = await makeRoutine();
    const from = await makeDueAt(routine.id, new Date("2001-03-04T09:00:00Z"));

    expect(await store.advanceNextRun(routine.id, from)).toBe(true);

    const after = await readRoutine(routine.id);
    // The moment the routine was due, not the moment the sweep happened to look at it.
    expect(after?.lastRunAt?.getTime()).toBe(from.getTime());
    expect(after?.nextRunAt.getTime()).toBeGreaterThan(from.getTime());
  });
});

describe("reading which routines are due", () => {
  test("returns the due ones oldest first and respects the limit", async () => {
    const { owner, agentId, channel } = await setUp();
    const oldest = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Oldest.",
      cron: DAILY,
    });
    const middle = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Middle.",
      cron: DAILY,
    });
    const newest = await store.create({
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      instruction: "Newest.",
      cron: DAILY,
    });
    await makeDueAt(oldest.id, new Date("2001-01-01T09:00:00Z"));
    await makeDueAt(middle.id, new Date("2001-01-02T09:00:00Z"));
    await makeDueAt(newest.id, new Date("2001-01-03T09:00:00Z"));

    const all = await store.dueRoutines(10);
    expect(all.map((row) => row.id).slice(0, 3)).toEqual([
      oldest.id,
      middle.id,
      newest.id,
    ]);
    expect(all[0]?.nextRunAt).toBeInstanceOf(Date);

    const limited = await store.dueRoutines(2);
    expect(limited.map((row) => row.id)).toEqual([oldest.id, middle.id]);
  });

  test("excludes a routine that is switched off", async () => {
    const { owner, routine } = await makeRoutine();
    await store.setEnabled(owner.id, routine.id, false);
    await makeDueAt(routine.id, new Date("2001-01-01T09:00:00Z"));

    const due = await store.dueRoutines(50);
    expect(due.map((row) => row.id)).not.toContain(routine.id);
  });

  test("excludes a routine whose next run is still ahead", async () => {
    const { routine } = await makeRoutine();
    // The create path already put this in the future; the point is that nothing rounds it down.
    const due = await store.dueRoutines(50);
    expect(due.map((row) => row.id)).not.toContain(routine.id);

    await makeDueAt(routine.id, new Date(Date.now() + 60 * 60 * 1000));
    const stillAhead = await store.dueRoutines(50);
    expect(stillAhead.map((row) => row.id)).not.toContain(routine.id);
  });
});

describe("opening and closing a run", () => {
  test("a finished run stamps finished_at and leaves the error null", async () => {
    const { routine } = await makeRoutine();

    const { runId } = await store.insertRun(routine.id);
    const [inFlight] = await database
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.id, runId));
    // Null status is the in-flight state, which is why the column is nullable.
    expect(inFlight?.status).toBeNull();
    expect(inFlight?.finishedAt).toBeNull();
    expect(inFlight?.startedAt).toBeInstanceOf(Date);

    await store.finishRun(runId, "succeeded");

    const [finished] = await database
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.id, runId));
    expect(finished?.status).toBe("succeeded");
    expect(finished?.finishedAt).toBeInstanceOf(Date);
    expect(finished?.error).toBeNull();
  });

  test("caps a long error rather than storing whatever a failure produced", async () => {
    const { routine } = await makeRoutine();
    const { runId } = await store.insertRun(routine.id);

    await store.finishRun(runId, "failed", "x".repeat(600));

    const [finished] = await database
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.id, runId));
    expect(finished?.status).toBe("failed");
    expect(finished?.error).toHaveLength(MAX_RUN_ERROR);
    expect(MAX_RUN_ERROR).toBe(400);
  });

  test("finishing a run twice cannot relabel what the first finish recorded", async () => {
    const { routine } = await makeRoutine();
    const { runId } = await store.insertRun(routine.id);

    await store.finishRun(runId, "succeeded");
    const [firstFinish] = await database
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.id, runId));

    // The natural next-task implementation: finish "succeeded", then something downstream throws,
    // and the catch calls finishRun("failed", ...). Without a finish-once guard this would
    // relabel a run that had already succeeded.
    await store.finishRun(runId, "failed", "late");

    const [secondFinish] = await database
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.id, runId));
    expect(secondFinish?.status).toBe("succeeded");
    expect(secondFinish?.error).toBeNull();
    expect(secondFinish?.finishedAt?.getTime()).toBe(
      firstFinish?.finishedAt?.getTime(),
    );
  });

  test("the page's last run reads the newest of several", async () => {
    const { owner, routine } = await makeRoutine();
    const first = await store.insertRun(routine.id);
    await store.finishRun(first.runId, "failed", "the first one");
    const second = await store.insertRun(routine.id);
    await store.finishRun(second.runId, "succeeded");

    const [summary] = await store.listFor(owner.id);
    expect(summary?.lastRun?.status).toBe("succeeded");
    expect(summary?.lastRun?.finishedAt).toBeInstanceOf(Date);
  });
});

/** Stale source runs retain uncertainty until an authoritative outcome arrives. */
describe("reaping the runs the server never finished", () => {
  /** Age one run row past the reaper's cutoff by hand; the reaper compares on the database's clock. */
  async function ageRun(runId: string, byMs: number) {
    await database
      .update(routineRuns)
      .set({ startedAt: new Date(Date.now() - byMs) })
      .where(eq(routineRuns.id, runId));
  }

  test("annotates only old unresolved rows and leaves terminal outcomes alone", async () => {
    const { routine } = await makeRoutine();
    const abandoned = await store.insertRun(routine.id);
    const inFlight = await store.insertRun(routine.id);
    const finished = await store.insertRun(routine.id);
    await store.finishRun(finished.runId, "succeeded");
    await ageRun(abandoned.runId, 11 * 60_000);

    const reaped = await store.reapAbandonedRuns(
      10 * 60_000,
      "the server did not finish this run; it may have restarted mid-turn",
    );

    // At least the row this test aged: the reaper is deliberately not routine-scoped, so a stray
    // abandoned row from elsewhere in the database may be swept up in the same call.
    expect(reaped).toBeGreaterThanOrEqual(1);
    expect(
      await store.reapAbandonedRuns(
        10 * 60_000,
        "the server did not finish this run; it may have restarted mid-turn",
      ),
    ).toBe(0);

    const rows = await database
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.routineId, routine.id));
    const byId = new Map(rows.map((row) => [row.id, row]));

    const abandonedRow = byId.get(abandoned.runId);
    expect(abandonedRow?.status).toBeNull();
    expect(abandonedRow?.finishedAt).toBeNull();
    expect(abandonedRow?.error).toContain("did not finish this run");

    // The fresh open row is a turn some server may still be running: closing it would make the real
    // finishRun a silent no-op, which is the exact overreach the age bound exists to prevent.
    expect(byId.get(inFlight.runId)?.status).toBeNull();

    // A confirmed outcome must remain unchanged.
    expect(byId.get(finished.runId)?.status).toBe("succeeded");
  });

  test("caps the reason the same way finishRun does", async () => {
    const { routine } = await makeRoutine();
    const { runId } = await store.insertRun(routine.id);
    await ageRun(runId, 11 * 60_000);

    await store.reapAbandonedRuns(10 * 60_000, "x".repeat(600));

    const [row] = await database
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.id, runId));
    expect(row?.error).toHaveLength(MAX_RUN_ERROR);
  });
});

/**
 * The sweep's off switch for a routine whose own schedule refuses to advance — a cron written before
 * a validation existed, or hand-edited under it. Left enabled, such a routine throws out of
 * `advanceNextRun` on every pass forever: its clock never moves and it burns a due slot each time.
 */
describe("switching off a routine the sweep cannot schedule", () => {
  test("disables it and leaves a skipped run carrying the reason where the page reads it", async () => {
    const { owner, routine } = await makeRoutine();

    await store.markUnschedulable(
      routine.id,
      "Routines may run at most every 15 minutes.",
    );

    const [summary] = await store.listFor(owner.id);
    expect(summary?.enabled).toBe(false);
    // The run row is the announcement: the sweep has no channel to say this in, so the page's
    // last-run column is where the owner learns why their routine stopped.
    expect(summary?.lastRun?.status).toBe("skipped");
    const [row] = await database
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.routineId, routine.id));
    expect(row?.error).toBe("Routines may run at most every 15 minutes.");
    expect(row?.finishedAt).toBeInstanceOf(Date);
  });

  test("a skipped announcement neither counts as a failure nor breaks a streak", async () => {
    const { routine } = await makeRoutine();
    const { runId } = await store.insertRun(routine.id);
    await store.finishRun(runId, "failed", "it threw");

    await store.markUnschedulable(routine.id, "unschedulable");

    // The fatigue rule reads through the announcement to the real failure tail.
    expect(await store.consecutiveFailures(routine.id)).toBe(1);
  });

  test("switching a routine back on starts its failure count again", async () => {
    const { owner, routine } = await makeRoutine();
    for (let failure = 0; failure < 10; failure += 1) {
      const { runId } = await store.insertRun(routine.id);
      await store.finishRun(runId, "failed", "the integration is down");
    }
    expect(await store.consecutiveFailures(routine.id)).toBe(10);

    // What the fatigue rule does at ten, and what the owner does once they have fixed the cause.
    await store.setEnabled(owner.id, routine.id, false);
    await store.setEnabled(owner.id, routine.id, true);
    expect(await store.consecutiveFailures(routine.id)).toBe(0);

    // The next failure is the first of a new streak, so it is announced as one rather than
    // switching the routine straight back off as the eleventh in a row.
    const { runId } = await store.insertRun(routine.id);
    await store.finishRun(runId, "failed", "still down");
    expect(await store.consecutiveFailures(routine.id)).toBe(1);
  });

  test("a routine deleted in the meantime is left alone", async () => {
    const { owner, routine } = await makeRoutine();
    await store.remove(owner.id, routine.id);

    // Gone is gone: no throw, and no orphaned run row for a routine nobody can see.
    await store.markUnschedulable(routine.id, "unschedulable");
    expect(
      await database
        .select()
        .from(routineRuns)
        .where(eq(routineRuns.routineId, routine.id)),
    ).toEqual([]);
  });
});

describe("the runner's read of one firing", () => {
  test("joins the run to its routine, owner included", async () => {
    const { owner, agentId, channel, routine } = await makeRoutine(
      "Post the standup summary.",
    );
    const { runId } = await store.insertRun(routine.id);

    // The owner comes back because the runner acts AS the owner: the channel it posts into and the
    // thread it continues are that person's, and nothing else in the run row says who that is.
    expect(await store.runContext(runId)).toEqual({
      routineId: routine.id,
      ownerUserId: owner.id,
      agentId,
      channelId: channel.id,
      // Read at dispatch so a routine paused after it was queued still does not run.
      enabled: true,
      executionBackend: "source",
      instruction: "Post the standup summary.",
    });
  });

  test("a run id nothing wrote reads as no firing", async () => {
    expect(await store.runContext("routine_run_missing")).toBeNull();
  });

  test("a deleted routine takes its queued firing with it", async () => {
    const { owner, routine } = await makeRoutine();
    const { runId } = await store.insertRun(routine.id);

    await store.remove(owner.id, routine.id);

    // Nobody's problem: the delete cascades, so there is no row left to finish and the runner has
    // nothing to say to anybody.
    expect(await store.runContext(runId)).toBeNull();
  });
});

/**
 * The consumer's re-read: "gone or disabled since the offer -> finish without dispatching" needs a
 * by-id read that is not owner-scoped, because the id it is given comes from a work item's own
 * payload, not from a person calling in with their own identity. `runContext` cannot answer this —
 * it needs a run row to exist and does not report `enabled` — so this is a second, narrower read.
 */
describe("the sweep's by-id read of a routine before firing", () => {
  test("an existing enabled routine reads back enabled", async () => {
    const { routine } = await makeRoutine();

    expect(await store.routineForFiring(routine.id)).toEqual({
      id: routine.id,
      enabled: true,
    });
  });

  test("a disabled routine reads back disabled, not missing", async () => {
    const { owner, routine } = await makeRoutine();
    await store.setEnabled(owner.id, routine.id, false);

    expect(await store.routineForFiring(routine.id)).toEqual({
      id: routine.id,
      enabled: false,
    });
  });

  test("a deleted routine reads as no routine at all", async () => {
    const { owner, routine } = await makeRoutine();
    await store.remove(owner.id, routine.id);

    expect(await store.routineForFiring(routine.id)).toBeNull();
  });
});

/**
 * The fatigue rule counts the failures at the tail, and this file pins what a `skipped` run does to
 * that tail: A SKIP IS NOT A FAILURE AND DOES NOT BREAK THE STREAK. A skip means the channel was
 * gone, not that the turn failed, so it is not counted; and it does not reset the count either,
 * because a routine whose channel flaps must not be able to escape the fatigue rule by skipping
 * between its failures.
 */
describe("counting the failures at the tail", () => {
  async function finish(
    routineId: string,
    status: "succeeded" | "failed" | "skipped",
  ) {
    const { runId } = await store.insertRun(routineId);
    await store.finishRun(
      runId,
      status,
      status === "failed" ? "it threw" : undefined,
    );
  }

  test("counts up, resets on a success, and is not broken by a skip", async () => {
    const { routine } = await makeRoutine();

    expect(await store.consecutiveFailures(routine.id)).toBe(0);

    await finish(routine.id, "succeeded");
    expect(await store.consecutiveFailures(routine.id)).toBe(0);

    await finish(routine.id, "failed");
    expect(await store.consecutiveFailures(routine.id)).toBe(1);

    await finish(routine.id, "failed");
    await finish(routine.id, "failed");
    expect(await store.consecutiveFailures(routine.id)).toBe(3);

    await finish(routine.id, "succeeded");
    expect(await store.consecutiveFailures(routine.id)).toBe(0);
  });

  test("a skip between failures neither counts nor resets", async () => {
    const { routine } = await makeRoutine();

    await finish(routine.id, "failed");
    await finish(routine.id, "skipped");
    await finish(routine.id, "failed");

    expect(await store.consecutiveFailures(routine.id)).toBe(2);
  });

  test("an in-flight run is not an outcome", async () => {
    const { routine } = await makeRoutine();
    await finish(routine.id, "failed");
    await store.insertRun(routine.id);

    expect(await store.consecutiveFailures(routine.id)).toBe(1);
  });

  /**
   * A routine with a flapping channel skips far more often than it fails. If the bounded window
   * is filled with every finished run — skips included — the skips eat slots a failure needed,
   * and a routine that has genuinely failed a dozen times in a row can look like it has failed
   * only six or seven. That falsifies the fatigue rule for exactly the scenario the skip rule was
   * written for: it would never reach the disable threshold. The window has to be filled with the
   * rows the fatigue rule can act on, not with every finished row.
   */
  test("skips do not dilute the bounded window the fatigue rule reads", async () => {
    const { routine } = await makeRoutine();

    // Twelve failures, each trailed by two skips, and nothing after them: a flapping channel's
    // shape. Post-fix, all twelve failures are read (well under the 20-row limit) because skips
    // never occupy a slot. Pre-fix, the 20-row window is filled with the interleaved skips too,
    // so it only reaches back a handful of failures — short of the >=10 disable threshold.
    for (let i = 0; i < 12; i++) {
      await finish(routine.id, "failed");
      await finish(routine.id, "skipped");
      await finish(routine.id, "skipped");
    }

    expect(await store.consecutiveFailures(routine.id)).toBeGreaterThanOrEqual(
      10,
    );
  });
});

describe("explicit cloud scheduler ownership", () => {
  test("managed schedules are invisible to original sweeper even if still enabled and overdue", async () => {
    const { owner, routine } = await makeRoutine();
    const due = new Date("2001-03-04T09:00:00Z");
    await database
      .update(routines)
      .set({
        executionBackend: "managed",
        providerAutomationId: `auto_fixture_${randomUUID()}`,
        nextRunAt: due,
      })
      .where(eq(routines.id, routine.id));
    const dueNow = await store.dueRoutines(100);
    expect(dueNow.some((x) => x.id === routine.id)).toBe(false);
    expect(await store.routineForFiring(routine.id)).toEqual({
      id: routine.id,
      enabled: false,
    });
    expect(await store.advanceNextRun(routine.id, due)).toBe(false);
    await expect(store.startManualRun(owner.id, routine.id)).rejects.toThrow(
      /managed routines/i,
    );
    await expect(store.setEnabled(owner.id, routine.id, false)).rejects.toThrow(
      /managed routine/i,
    );
    const [summary] = await store.listFor(owner.id);
    expect(summary?.executionBackend).toBe("managed");
  });
  test("provisioning and uncertain migrations also cannot fire in source worker", async () => {
    for (const backend of ["provisioning", "sync_unknown"] as const) {
      const { routine } = await makeRoutine();
      await database
        .update(routines)
        .set({
          executionBackend: backend,
          nextRunAt: new Date("2001-03-04T09:00:00Z"),
        })
        .where(eq(routines.id, routine.id));
      expect(
        (await store.dueRoutines(100)).some((x) => x.id === routine.id),
      ).toBe(false);
      expect((await store.routineForFiring(routine.id))?.enabled).toBe(false);
    }
  });
});

describe("approved managed schedule offline reservation and recovery", () => {
  async function managedFixture(
    create: (input: {
      name: string;
      sessionID: string;
      instructions: string;
      expression?: string;
      timezone?: string;
      runAt?: number;
    }) => Promise<{ id?: string }>,
  ) {
    const { owner, agentId, channel } = await setUp();
    const sessionID = "sess_" + randomUUID().replaceAll("-", "");
    const threadID = "thread_" + randomUUID().replaceAll("-", "");
    await database.insert(managedAgentSessionLinks).values({
      ownerUserId: owner.id,
      botId: agentId,
      channelId: channel.id,
      sourceThreadId: threadID,
      providerSessionId: sessionID,
      creationKey: "fixture",
    });
    let allowed = true,
      calls = 0;
    const provider = {
      createAutomation: async (data: Parameters<typeof create>[0]) => {
        calls++;
        return create(data);
      },
      listAutomationInvocations: async () => ({ data: [], has_more: false }),
      retrieveAutomationInvocation: async () => {
        throw Error("Unexpected invocation");
      },
      listAutomations: async () => ({ data: [], has_more: false }),
    } as unknown as ManagedAutomationProvider;
    const bridge = createManagedRoutineBridge({
      database,
      provider,
      authorise: async (scope) =>
        allowed &&
        scope.ownerUserId === owner.id &&
        scope.channelId === channel.id &&
        scope.agentId === agentId &&
        scope.threadId === threadID,
      assertSpendingBoundary: async () => {},
    });
    return {
      bridge,
      provider,
      owner,
      agentId,
      channel,
      sessionID,
      get calls() {
        return calls;
      },
      revoke() {
        allowed = false;
      },
    };
  }
  test("cutover refuses an old still-open source run without creating paid work", async () => {
    const f = await managedFixture(async () => ({ id: "auto_never" }));
    const routine = await store.create({
      ownerUserId: f.owner.id,
      agentId: f.agentId,
      channelId: f.channel.id,
      instruction: "Keep source execution exclusive.",
      cron: DAILY,
    });
    const { runId } = await store.insertRun(routine.id);
    await database
      .update(routineRuns)
      .set({ startedAt: new Date(Date.now() - 60 * 60_000) })
      .where(eq(routineRuns.id, runId));
    await store.reapAbandonedRuns(
      10 * 60_000,
      "Execution outcome is unconfirmed after restart.",
    );
    await expect(
      f.bridge.migrate(f.owner.id, routine.id, "old_open_run"),
    ).rejects.toBeInstanceOf(RoutineRefusedError);
    expect(f.calls).toBe(0);
    await expect(
      store.startManualRun(f.owner.id, routine.id),
    ).rejects.toBeInstanceOf(RoutineRefusedError);
    const [saved] = await database
      .select()
      .from(routines)
      .where(eq(routines.id, routine.id));
    expect(saved.executionBackend).toBe("source");
    const [run] = await database
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.id, runId));
    expect(run.status).toBeNull();
    expect(run.finishedAt).toBeNull();
    // A late authoritative worker response must still be able to settle its own run.
    await store.finishRun(runId, "succeeded");
    const [settled] = await database
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.id, runId));
    expect(settled.status).toBe("succeeded");
    expect(settled.error).toBeNull();
    expect(settled.finishedAt).toBeInstanceOf(Date);
  });
  test("confirmed deletion retains the approved request across restart without resurrecting a schedule", async () => {
    const f = await managedFixture(async () => ({
      id: "auto_" + randomUUID().replaceAll("-", ""),
    }));
    const params = {
      channelId: f.channel.id,
      agentId: f.agentId,
      instruction: "Send my morning reading.",
      requestId: "deleted_" + randomUUID().replaceAll("-", "").slice(0, 20),
      cron: "0 9 * * *",
      timezone: "UTC",
    };
    const first = await f.bridge.createApprovedSchedule(f.owner.id, params);
    await store.insertRun(first.routineId);
    let deletes = 0;
    f.provider.deleteAutomation = async () => {
      deletes++;
    };
    await f.bridge.change(f.owner.id, first.routineId, "delete", "delete_once");
    const restarted = createManagedRoutineBridge({
      database,
      provider: f.provider,
      authorise: async (scope) =>
        scope.ownerUserId === f.owner.id &&
        scope.channelId === f.channel.id &&
        scope.agentId === f.agentId,
      assertSpendingBoundary: async () => {
        throw Error("Deleted requests never authorize new spending");
      },
    });
    expect(await restarted.createApprovedSchedule(f.owner.id, params)).toEqual({
      routineId: first.routineId,
      state: "deleted",
      automationId: first.automationId,
    });
    expect(f.calls).toBe(1);
    expect(deletes).toBe(1);
    expect(await store.listFor(f.owner.id)).toEqual([]);
    expect(
      await createActivityStore(database).forBot(f.owner.id, f.agentId),
    ).toEqual({ inProgress: [], scheduled: [], completed: [] });
    await expect(
      restarted.change(f.owner.id, first.routineId, "resume", "resume_deleted"),
    ).rejects.toBeInstanceOf(RoutineNotFoundError);
    await expect(
      restarted.change(f.owner.id, first.routineId, "delete", "delete_again"),
    ).rejects.toBeInstanceOf(RoutineNotFoundError);
    await expect(
      store.listRuns(f.owner.id, first.routineId),
    ).rejects.toBeInstanceOf(RoutineNotFoundError);
    await expect(
      restarted.createApprovedSchedule(f.owner.id, {
        ...params,
        instruction: "Different work",
      }),
    ).rejects.toBeInstanceOf(RoutineRefusedError);
    expect(f.calls).toBe(1);
    expect(deletes).toBe(1);
  });
  test("ambiguous deletion stays frozen until exact provider absence is verified", async () => {
    const f = await managedFixture(async () => ({
      id: "auto_" + randomUUID().replaceAll("-", ""),
    }));
    const params = {
      channelId: f.channel.id,
      agentId: f.agentId,
      instruction: "Send an approved digest.",
      requestId:
        "delete_repair_" + randomUUID().replaceAll("-", "").slice(0, 16),
      cron: "0 9 * * *",
      timezone: "UTC",
    };
    const first = await f.bridge.createApprovedSchedule(f.owner.id, params);
    let deletes = 0;
    f.provider.deleteAutomation = async () => {
      deletes++;
      throw Error("Provider reply lost");
    };
    await expect(
      f.bridge.change(f.owner.id, first.routineId, "delete", "lost_delete"),
    ).rejects.toThrow("Provider reply lost");
    expect(
      (await f.bridge.createApprovedSchedule(f.owner.id, params)).state,
    ).toBe("unverified");
    f.provider.retrieveAutomation = async () => {
      throw Object.assign(Error("Service unavailable"), { status: 503 });
    };
    expect(
      (await f.bridge.repair(f.owner.id, first.routineId)).reconciled,
    ).toBe(false);
    expect((await store.listFor(f.owner.id))[0]?.executionBackend).toBe(
      "sync_unknown",
    );
    f.provider.retrieveAutomation = async () => {
      throw Object.assign(Error("Not found"), { status: 404 });
    };
    expect(
      (await f.bridge.repair(f.owner.id, first.routineId)).reconciled,
    ).toBe(true);
    expect(
      (await f.bridge.createApprovedSchedule(f.owner.id, params)).state,
    ).toBe("deleted");
    expect(await store.listFor(f.owner.id)).toEqual([]);
    expect(f.calls).toBe(1);
    expect(deletes).toBe(1);
    const [saved] = await database
      .select()
      .from(routines)
      .where(eq(routines.id, first.routineId));
    expect(saved.enabled).toBe(false);
    expect(saved.providerSyncOperation).toBe("deleted");
    expect(saved.providerAutomationId).toBe(first.automationId!);
    const { owner: foreign } = await setUp();
    await expect(
      f.bridge.createApprovedSchedule(foreign.id, params),
    ).rejects.toBeInstanceOf(RoutineRefusedError);
    await expect(
      f.bridge.state(foreign.id, first.routineId),
    ).rejects.toBeInstanceOf(RoutineNotFoundError);
    expect(f.calls).toBe(1);
  });
  test("simultaneous original-owner approvals create only one provider recurring schedule", async () => {
    const fixture = await managedFixture(async () => ({
      id: "auto_" + randomUUID().replaceAll("-", ""),
    }));
    const param = {
      channelId: fixture.channel.id,
      agentId: fixture.agentId,
      instruction: "Provide an approved daily digest.",
      requestId: "consent_" + randomUUID().replaceAll("-", "").slice(0, 20),
      cron: "0 9 * * *",
      timezone: "UTC",
    };
    const [a, b] = await Promise.all([
      fixture.bridge.createApprovedSchedule(fixture.owner.id, param),
      fixture.bridge.createApprovedSchedule(fixture.owner.id, param),
    ]);
    expect(fixture.calls).toBe(1);
    expect([a.state, b.state]).toContain("managed");
    expect(
      [a.state, b.state].every(
        (state) => state === "managed" || state === "unverified",
      ),
    ).toBe(true);
    const rows = await store.listFor(fixture.owner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].executionBackend).toBe("managed");
    expect(
      (await store.dueRoutines(100)).some((x) => x.id === rows[0].id),
    ).toBe(false);
  });
  test("in-flight manual invocation excludes concurrent pause without losing its durable receipt", async () => {
    const autoID = "auto_" + randomUUID().replaceAll("-", "");
    const f = await managedFixture(async () => ({ id: autoID }));
    const created = await f.bridge.createApprovedSchedule(f.owner.id, {
      channelId: f.channel.id,
      agentId: f.agentId,
      instruction: "Manual concurrency fixture",
      requestId: "manual_" + randomUUID().replaceAll("-", "").slice(0, 20),
      cron: DAILY,
      timezone: "UTC",
    });
    let entered!: () => void,
      release!: () => void,
      pauses = 0;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.provider.invokeAutomation = async () => {
      entered();
      await gate;
      return {
        id: "inv_" + randomUUID().replaceAll("-", ""),
        session_id: f.sessionID,
        status: "queued",
      };
    };
    f.provider.pauseAutomation = async () => {
      pauses++;
      return {};
    };
    const pending = f.bridge.manual(
      f.owner.id,
      created.routineId,
      "manual_request",
    );
    try {
      await started;
      await expect(
        f.bridge.change(
          f.owner.id,
          created.routineId,
          "pause",
          "pause_request",
        ),
      ).rejects.toBeInstanceOf(RoutineRefusedError);
      expect(pauses).toBe(0);
      const [receipt] = await database
        .select()
        .from(managedRoutineInvocations)
        .where(eq(managedRoutineInvocations.routineId, created.routineId));
      expect(receipt.deliveryStatus).toBe("unknown");
    } finally {
      release();
      await pending;
    }
  });
  test("unknown manual write remains frozen without replay or latest-invocation guessing", async () => {
    const f = await managedFixture(async () => ({
      id: "auto_" + randomUUID().replaceAll("-", ""),
    }));
    const created = await f.bridge.createApprovedSchedule(f.owner.id, {
      channelId: f.channel.id,
      agentId: f.agentId,
      instruction: "Unknown manual fixture",
      requestId: "unknown_" + randomUUID().replaceAll("-", "").slice(0, 20),
      cron: DAILY,
      timezone: "UTC",
    });
    f.provider.retrieveAutomation = async (id) => ({
      id,
      status: "active",
      target: { session_id: f.sessionID },
    });
    let calls = 0;
    f.provider.invokeAutomation = async () => {
      calls++;
      throw Error("Lost invocation acknowledgement");
    };
    await expect(
      f.bridge.manual(f.owner.id, created.routineId, "manual_unknown"),
    ).rejects.toThrow();
    await expect(
      f.bridge.manual(f.owner.id, created.routineId, "manual_unknown"),
    ).rejects.toBeInstanceOf(RoutineRefusedError);
    const repair = await f.bridge.repair(f.owner.id, created.routineId);
    expect(repair.reconciled).toBe(false);
    expect(calls).toBe(1);
    const [saved] = await database
      .select()
      .from(routines)
      .where(eq(routines.id, created.routineId));
    expect(saved.executionBackend).toBe("sync_unknown");
  });
  test("manual receipt repair uses exact invocation identity and never claims agent completion", async () => {
    const autoID = "auto_" + randomUUID().replaceAll("-", "");
    const f = await managedFixture(async () => ({ id: autoID }));
    const created = await f.bridge.createApprovedSchedule(f.owner.id, {
      channelId: f.channel.id,
      agentId: f.agentId,
      instruction: "Known receipt fixture",
      requestId: "known_" + randomUUID().replaceAll("-", "").slice(0, 20),
      cron: DAILY,
      timezone: "UTC",
    });
    const invocationID = "inv_" + randomUUID().replaceAll("-", "");
    f.provider.retrieveAutomation = async (id) => ({
      id,
      status: "active",
      target: { session_id: f.sessionID },
    });
    f.provider.invokeAutomation = async () => ({
      id: invocationID,
      session_id: f.sessionID,
      status: "queued",
    });
    await f.bridge.manual(f.owner.id, created.routineId, "manual_known");
    const [receipt] = await database
      .select()
      .from(managedRoutineInvocations)
      .where(eq(managedRoutineInvocations.routineId, created.routineId));
    // Simulate a crash after saving the provider receipt but before settling the routine.
    await database
      .update(routines)
      .set({
        executionBackend: "sync_unknown",
        providerSyncOperation: "manual",
        providerSyncKey: receipt.receiptKey,
      })
      .where(eq(routines.id, created.routineId));
    f.provider.retrieveAutomationInvocation = async (auto, inv) => {
      expect(auto).toBe(autoID);
      expect(inv).toBe(invocationID);
      return {
        id: invocationID,
        automation_id: autoID,
        session_id: f.sessionID,
        status: "completed",
        source: { type: "manual" },
      };
    };
    const repair = await f.bridge.repair(f.owner.id, created.routineId);
    expect(repair.reconciled).toBe(true);
    const [recovered] = await database
      .select()
      .from(managedRoutineInvocations)
      .where(eq(managedRoutineInvocations.receiptKey, receipt.receiptKey));
    expect(recovered.executionStatus).toBe("unverified");
    expect(recovered.rootTurnId).toBeNull();
    expect(recovered.deliveryStatus).toBe("queued");
  });
  test("settled one-time recovery after run time never repeats creation or applies new-write time rules", async () => {
    const f = await managedFixture(async () => ({
      id: "auto_" + randomUUID().replaceAll("-", ""),
    }));
    const now = Date.now(),
      params = {
        channelId: f.channel.id,
        agentId: f.agentId,
        instruction: "Approved one-time digest",
        requestId: "elapsed_" + randomUUID().replaceAll("-", "").slice(0, 20),
        runAt: Math.floor(now / 1000) + 7200,
      };
    const first = await f.bridge.createApprovedSchedule(f.owner.id, params);
    const realNow = Date.now;
    try {
      Date.now = () => now + 3 * 60 * 60_000;
      expect(await f.bridge.createApprovedSchedule(f.owner.id, params)).toEqual(
        first,
      );
      await expect(
        f.bridge.createApprovedSchedule(f.owner.id, {
          ...params,
          requestId: "new_" + randomUUID().replaceAll("-", "").slice(0, 20),
        }),
      ).rejects.toBeInstanceOf(RoutineRefusedError);
      expect(f.calls).toBe(1);
    } finally {
      Date.now = realNow;
    }
  });
  test("settled approved creation recovers its exact source mapping without a second provider write", async () => {
    const autoID = "auto_" + randomUUID().replaceAll("-", "");
    const f = await managedFixture(async () => ({ id: autoID }));
    const params = {
      channelId: f.channel.id,
      agentId: f.agentId,
      instruction: "Approved digest",
      requestId: "settled_" + randomUUID().replaceAll("-", "").slice(0, 20),
      cron: DAILY,
      timezone: "UTC",
    };
    const first = await f.bridge.createApprovedSchedule(f.owner.id, params);
    const recovered = await f.bridge.createApprovedSchedule(f.owner.id, params);
    expect(recovered).toEqual(first);
    expect(recovered.state).toBe("managed");
    expect(f.calls).toBe(1);
  });
  test("unknown provider POST remains frozen and cannot automatically replay", async () => {
    const f = await managedFixture(async () => {
      throw Error("Lost provider acknowledgement");
    });
    const params = {
      channelId: f.channel.id,
      agentId: f.agentId,
      instruction: "A single review",
      requestId: "unknown_" + randomUUID().replaceAll("-", "").slice(0, 18),
      runAt: Math.floor(Date.now() / 1000) + 7200,
    };
    await expect(
      f.bridge.createApprovedSchedule(f.owner.id, params),
    ).rejects.toThrow();
    const second = await f.bridge.createApprovedSchedule(f.owner.id, params);
    expect(second.state).toBe("unverified");
    expect(f.calls).toBe(1);
    const [row] = await store.listFor(f.owner.id);
    expect(row.executionBackend).toBe("provisioning");
    expect((await store.dueRoutines(100)).some((x) => x.id === row.id)).toBe(
      false,
    );
  });
  test("owner revocation freezes new creations even with matching provider session", async () => {
    const f = await managedFixture(async () => ({
      id: "auto_" + randomUUID().replaceAll("-", ""),
    }));
    f.revoke();
    await expect(
      f.bridge.createApprovedSchedule(f.owner.id, {
        channelId: f.channel.id,
        agentId: f.agentId,
        instruction: "Not authorized",
        requestId: "revoked_" + randomUUID().replaceAll("-", "").slice(0, 18),
        runAt: Math.floor(Date.now() / 1000) + 7200,
      }),
    ).rejects.toThrow();
    expect(f.calls).toBe(0);
  });
  test("strict default-deny spending cap blocks source reservation before provider POST", async () => {
    const f = await managedFixture(async () => ({
      id: "auto_" + randomUUID().replaceAll("-", ""),
    }));
    const blocked = createManagedRoutineBridge({
      database,
      provider: {
        createAutomation: async () => {
          throw Error("Provider must not be touched");
        },
      } as unknown as ManagedAutomationProvider,
      authorise: async () => true,
      assertSpendingBoundary: async () => {
        throw Error("Hard spending limit unavailable");
      },
    });
    await expect(
      blocked.createApprovedSchedule(f.owner.id, {
        channelId: f.channel.id,
        agentId: f.agentId,
        instruction: "Do not spend",
        requestId: "cap_" + randomUUID().replaceAll("-", "").slice(0, 18),
        runAt: Math.floor(Date.now() / 1000) + 7200,
      }),
    ).rejects.toThrow(/spending/);
    expect(await store.listFor(f.owner.id)).toHaveLength(0);
  });
});
