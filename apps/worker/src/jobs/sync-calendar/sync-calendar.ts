import { prisma } from "../../lib/prisma";
import { google, calendar_v3 } from "googleapis";
import * as cron from "node-cron";
import { createHash } from "node:crypto";
import { encryptOAuthToken, decryptOAuthToken } from "@second-brain/shared";
import {
  deleteMemoryChunksForSource,
  markMemorySourcesChanged,
  withPostgresAdvisoryLock,
} from "@second-brain/db";

type GoogleSource = "calendar" | "gmail" | "drive" | "contact";

export class SyncCalendarJob {
  private static getApiBaseUrl() {
    return (
      process.env.API_PUBLIC_URL ||
      process.env.API_URL ||
      "http://localhost:3001"
    );
  }

  private static getRedirectUri() {
    return (
      process.env.GOOGLE_REDIRECT_URI ||
      `${this.getApiBaseUrl().replace(/\/$/, "")}/api/calendar/oauth/callback`
    );
  }

  // Helper to normalize Google Calendar data to our Schema
  private static normalizeEvent(
    googleEvent: calendar_v3.Schema$Event,
    userId: string,
  ) {
    const startTime = googleEvent.start?.dateTime || googleEvent.start?.date;
    const endTime = googleEvent.end?.dateTime || googleEvent.end?.date;

    const normalized = {
      external_id: googleEvent.id as string,
      user_id: userId,
      title: googleEvent.summary || "Untitled Event",
      description: googleEvent.description || null,
      start_time: startTime ? new Date(startTime) : new Date(),
      end_time: endTime ? new Date(endTime) : new Date(),
      html_link: googleEvent.htmlLink || null,
    };
    return {
      ...normalized,
      content_hash: createHash("sha256")
        .update(JSON.stringify({
          title: normalized.title,
          description: normalized.description,
          startTime: normalized.start_time.toISOString(),
          endTime: normalized.end_time.toISOString(),
          htmlLink: normalized.html_link,
        }))
        .digest("hex"),
    };
  }

  // Core logic to sync events for a specific user
  static async syncEventsForUser(user: any) {
    if (!user.google_access_token && !user.google_refresh_token) {
      console.log(
        `[Worker - Calendar Sync] Skipping User ${user.id}: No Google token found.`,
      );
      return;
    }

    console.log(
      `[Worker - Calendar Sync] Starting background sync for User ID: ${user.id}`,
    );

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      this.getRedirectUri(),
    );

    oauth2Client.setCredentials({
      access_token: decryptOAuthToken(user.google_access_token),
      refresh_token: decryptOAuthToken(user.google_refresh_token),
    });
    oauth2Client.on("tokens", async (tokens) => {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(tokens.access_token && {
            google_access_token: encryptOAuthToken(tokens.access_token),
          }),
          ...(tokens.refresh_token && {
            google_refresh_token: encryptOAuthToken(tokens.refresh_token),
          }),
        },
      });
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    try {
      const timeMin = new Date();
      timeMin.setDate(timeMin.getDate() - 30); // Sync past 30 days
      const timeMax = new Date();
      timeMax.setDate(timeMax.getDate() + 60); // Sync future 60 days

      const savedSyncToken = await this.getCalendarSyncToken(user.id);
      let incremental = Boolean(savedSyncToken);
      let pageResult: Awaited<ReturnType<typeof this.listEventPages>>;
      try {
        pageResult = await this.listEventPages(calendar, {
          syncToken: savedSyncToken ?? undefined,
          timeMin,
          timeMax,
        });
      } catch (error) {
        if (!savedSyncToken || !this.isExpiredSyncToken(error)) throw error;
        incremental = false;
        pageResult = await this.listEventPages(calendar, { timeMin, timeMax });
      }

      const rawEvents = pageResult.events;

      const syncedEvents = await prisma.$transaction(async (tx) => {
        const events = [];
        const affectedStarts: Date[] = [];
        const affectedEnds: Date[] = [];
        const active = rawEvents.filter((event) => event.id && event.status !== "cancelled");
        const normalizedEvents = active.map((event) => this.normalizeEvent(event, user.id));
        const existing = normalizedEvents.length
          ? await tx.calendarEvent.findMany({
              where: { user_id: user.id, external_id: { in: normalizedEvents.map((event) => event.external_id) } },
              select: { external_id: true, content_hash: true },
            })
          : [];
        const hashes = new Map(existing.map((event) => [event.external_id, event.content_hash]));

        for (const event of rawEvents) {
          if (event.status === "cancelled") {
            const deleted = await tx.calendarEvent.findFirst({
              where: { external_id: event.id as string, user_id: user.id },
              select: { id: true, start_time: true, end_time: true },
            });
            if (deleted) {
              affectedStarts.push(deleted.start_time);
              affectedEnds.push(deleted.end_time);
              await deleteMemoryChunksForSource(tx as any, {
                userId: user.id,
                sourceType: "calendar",
                sourceId: deleted.id,
              });
            }
            await tx.calendarEvent.deleteMany({
              where: {
                external_id: event.id as string,
                user_id: user.id,
              },
            });
            console.log(
              `Cancelled event removed from Google Calendar: [${event.id}]`,
            );
            continue;
          }
          const normalizedData = this.normalizeEvent(event, user.id);
          if (hashes.get(normalizedData.external_id) === normalizedData.content_hash) continue;
          const syncedEvent = await tx.calendarEvent.upsert({
            where: {
              user_id_external_id: {
                user_id: normalizedData.user_id,
                external_id: normalizedData.external_id,
              },
            },
            update: {
              title: normalizedData.title,
              description: normalizedData.description,
              start_time: normalizedData.start_time,
              end_time: normalizedData.end_time,
              html_link: normalizedData.html_link,
              content_hash: normalizedData.content_hash,
            },
            create: {
              external_id: normalizedData.external_id,
              user_id: normalizedData.user_id,
              title: normalizedData.title,
              description: normalizedData.description,
              start_time: normalizedData.start_time,
              end_time: normalizedData.end_time,
              html_link: normalizedData.html_link,
              content_hash: normalizedData.content_hash,
            },
          });

          await this.enqueueCalendarIndexingJob(tx, {
            userId: user.id,
            calendarEventId: syncedEvent.id,
            externalId: syncedEvent.external_id,
            title: syncedEvent.title,
          });

          events.push(syncedEvent);
          affectedStarts.push(syncedEvent.start_time);
          affectedEnds.push(syncedEvent.end_time);
        }

        if (affectedStarts.length) {
          const starts = affectedStarts.map((date) => date.getTime());
          const ends = affectedEnds.map((date) => date.getTime());
          await markMemorySourcesChanged(tx as any, {
            userId: user.id,
            occurredFrom: new Date(Math.min(...starts)),
            occurredTo: new Date(Math.max(...ends)),
          });
          await tx.searchHistory.updateMany({
            where: { user_id: user.id, expires_at: { gt: new Date() } },
            data: { expires_at: new Date() },
          });
        }

        return events;
      });
      console.log(
        `[Worker - Calendar Sync] Success: Read ${rawEvents.length} ${incremental ? "changed" : "initial"} events and queued ${syncedEvents.length} indexing jobs for User ${user.id}`,
      );
      await this.recordGoogleSyncSuccess(user.id, "calendar", pageResult.nextSyncToken);
    } catch (error: any) {
      await this.recordGoogleSyncFailure(user.id, "calendar", error);
      console.error(
        `[Worker - Calendar Sync] Error for User ${user.id}: ${this.toErrorMessage(error)}`,
      );
    }
  }

  private static async listEventPages(
    calendar: calendar_v3.Calendar,
    input: { syncToken?: string; timeMin: Date; timeMax: Date },
  ) {
    const events: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const response = await calendar.events.list({
        calendarId: "primary",
        maxResults: 2500,
        pageToken,
        singleEvents: true,
        showDeleted: true,
        ...(input.syncToken
          ? { syncToken: input.syncToken }
          : {
              timeMin: input.timeMin.toISOString(),
              timeMax: input.timeMax.toISOString(),
              orderBy: "startTime" as const,
            }),
      });
      events.push(...(response.data.items ?? []));
      pageToken = response.data.nextPageToken ?? undefined;
      nextSyncToken = response.data.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
    return { events, nextSyncToken };
  }

  private static async getCalendarSyncToken(userId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ sync_token: string | null }>>(
      `SELECT sync_cursor->>'syncToken' AS sync_token FROM google_connections WHERE user_id = $1::text AND source = 'calendar' LIMIT 1`,
      userId,
    ).catch(() => []);
    return rows[0]?.sync_token ?? null;
  }

  private static isExpiredSyncToken(error: unknown) {
    const value = error as { code?: number; response?: { status?: number } };
    return value.code === 410 || value.response?.status === 410;
  }

  // Initialize the Background Cron Job
  static startCron() {
    // Schedule: Every 6 hours (00:00, 06:00, 12:00, 18:00)
    cron.schedule("0 */6 * * *", () => {
      void this.syncEligibleUsers().catch((error) => {
        console.error(
          `[Worker - Calendar Sync] Cron failed: ${this.toErrorMessage(error)}`,
        );
      });
    });

    console.log("Background Worker for Auto-Sync Calendar started.");
  }

  static async syncEligibleUsers() {
    const lock = await withPostgresAdvisoryLock(
      "calendar-sync-cron",
      async () => {
        console.log("[Cron] Triggering Automated Google Calendar Sync");
        const usersToSync = await prisma.user.findMany({
          where: {
            OR: [
              { google_access_token: { not: null } },
              { google_refresh_token: { not: null } },
            ],
          },
        });
        console.log(
          `[Worker - Calendar Sync] Found ${usersToSync.length} eligible users for sync.`,
        );
        for (const user of usersToSync) {
          await this.syncEventsForUser(user);
        }
        return usersToSync.length;
      },
    );

    if (!lock.acquired) {
      console.log(
        "[Worker - Calendar Sync] Another worker owns the cron lock; skipping.",
      );
      return 0;
    }
    return lock.value;
  }

  private static async enqueueCalendarIndexingJob(
    tx: any,
    input: {
      userId: string;
      calendarEventId: string;
      externalId: string;
      title: string;
    },
  ) {
    return tx.indexingOutbox.upsert({
      where: {
        job_type_source_type_source_id: {
          job_type: "index_memory",
          source_type: "calendar",
          source_id: input.calendarEventId,
        },
      },
      update: {
        user_id: input.userId,
        status: "pending",
        retry_count: 0,
        error: null,
        payload: {
          externalId: input.externalId,
          sourceTitle: input.title,
        },
        generation: { increment: 1 },
        run_after: new Date(),
        locked_at: null,
        locked_by: null,
        processed_at: null,
      },
      create: {
        user_id: input.userId,
        job_type: "index_memory",
        source_type: "calendar",
        source_id: input.calendarEventId,
        status: "pending",
        payload: {
          externalId: input.externalId,
          sourceTitle: input.title,
        },
      },
    });
  }

  private static async recordGoogleSyncSuccess(
    userId: string,
    source: GoogleSource,
    syncToken?: string,
  ) {
    await this.upsertGoogleConnection({
      userId,
      source,
      connected: true,
      lastSyncAt: new Date(),
      lastError: null,
      syncToken,
    });
  }

  private static async recordGoogleSyncFailure(
    userId: string,
    source: GoogleSource,
    error: unknown,
  ) {
    const message = this.toErrorMessage(error);
    const reconnectRequired = this.isGoogleReconnectRequiredError(message);

    await this.upsertGoogleConnection({
      userId,
      source,
      connected: !reconnectRequired,
      lastSyncAt: null,
      lastError: reconnectRequired ? `Needs reconnect: ${message}` : message,
    });
  }

  private static async upsertGoogleConnection(input: {
    userId: string;
    source: GoogleSource;
    connected: boolean;
    lastSyncAt: Date | null;
    lastError: string | null;
    syncToken?: string;
  }) {
    try {
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO google_connections (
          user_id,
          source,
          connected,
          scopes,
          last_sync_at,
          last_error,
          last_error_at,
          sync_cursor
        )
        VALUES (
          $1::text,
          $2,
          $3,
          $4,
          $5,
          $6,
          CASE WHEN $6 IS NULL THEN NULL ELSE now() END,
          CASE WHEN $7::text IS NULL THEN NULL ELSE jsonb_build_object('syncToken', $7::text) END
        )
        ON CONFLICT (user_id, source) DO UPDATE SET
          connected = EXCLUDED.connected,
          scopes = EXCLUDED.scopes,
          last_sync_at = COALESCE(EXCLUDED.last_sync_at, google_connections.last_sync_at),
          last_error = EXCLUDED.last_error,
          last_error_at = CASE WHEN EXCLUDED.last_error IS NULL THEN NULL ELSE now() END,
          sync_cursor = COALESCE(EXCLUDED.sync_cursor, google_connections.sync_cursor),
          updated_at = now()
        `,
        input.userId,
        input.source,
        input.connected,
        this.getGoogleSourceScopes(input.source),
        input.lastSyncAt,
        input.lastError?.slice(0, 1000) ?? null,
        input.syncToken ?? null,
      );
    } catch (error) {
      console.warn(
        `[Worker - Calendar Sync] Could not update google_connections for ${input.source}: ${this.toErrorMessage(error)}`,
      );
    }
  }

  private static getGoogleSourceScopes(source: GoogleSource) {
    const scopes: Record<GoogleSource, string[]> = {
      calendar: ["https://www.googleapis.com/auth/calendar.readonly"],
      gmail: ["https://www.googleapis.com/auth/gmail.readonly"],
      drive: ["https://www.googleapis.com/auth/drive.readonly"],
      contact: ["https://www.googleapis.com/auth/contacts.readonly"],
    };

    return scopes[source];
  }

  private static isGoogleReconnectRequiredError(message: string) {
    const normalized = message.toLowerCase();

    return (
      /\binvalid_grant\b/i.test(message) ||
      /\binvalid_credentials\b/i.test(message) ||
      normalized.includes("invalid credentials") ||
      normalized.includes("token has been expired") ||
      normalized.includes("token has been revoked") ||
      normalized.includes("token expired") ||
      normalized.includes("unauthorized") ||
      normalized.includes("401") ||
      normalized.includes("insufficient authentication scopes") ||
      normalized.includes("insufficient permission") ||
      normalized.includes("insufficient permissions") ||
      normalized.includes("insufficient scope") ||
      normalized.includes("insufficient_scope") ||
      (normalized.includes("forbidden") &&
        (normalized.includes("scope") || normalized.includes("permission")))
    );
  }

  private static toErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === "object" && error) {
      const record = error as Record<string, unknown>;
      return (
        [
          record.code,
          record.status,
          record.message,
          record.response ? JSON.stringify(record.response) : null,
          record.errors ? JSON.stringify(record.errors) : null,
        ]
          .filter(Boolean)
          .join(" ") || "Unknown Google Calendar sync error"
      );
    }

    return String(error);
  }
}
