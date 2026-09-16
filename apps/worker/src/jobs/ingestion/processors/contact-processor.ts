import { indexMemoryFromContact } from "@second-brain/ai";
import { deleteMemoryChunksForSource } from "@second-brain/db";
import { prisma } from "../../../lib/prisma";
import type { SourceProcessor } from "../indexing-job";
import { persistChunksWithEntities } from "../memory-persistence";

export const processContact: SourceProcessor = async (job, context) => {
  const contact = await prisma.googleContact.findFirst({
    where: { id: job.source_id, user_id: job.user_id },
  });
  if (!contact) {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await deleteMemoryChunksForSource(tx as any, {
        userId: job.user_id,
        sourceType: "contact",
        sourceId: job.source_id,
      });
    });
    return;
  }
  const result = await indexMemoryFromContact({
    userId: job.user_id,
    contacts: [
      {
        contactId: contact.id,
        externalId: contact.external_id,
        displayName: contact.display_name,
        emailAddresses: contact.email_addresses,
        phoneNumbers: contact.phone_numbers,
        organizations: contact.organizations,
        photoUrl: contact.photo_url,
        updatedAt: contact.updated_at,
      },
    ],
    insertChunks: (chunks) =>
      prisma.$transaction(async (tx) => {
        await context.assertLeaseCurrent(tx);
        await persistChunksWithEntities(tx, chunks, {
          userId: job.user_id,
          sourceType: "contact",
          sourceId: contact.id,
        });
      }),
  });
  if (result.errors.length) {
    throw new Error(result.errors.map((item) => item.error).join("; "));
  }
};
