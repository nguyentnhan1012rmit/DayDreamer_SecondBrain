export function retainAttachmentErrors<T extends { status: string }>(
  attachments: readonly T[],
) {
  return attachments.filter((attachment) => attachment.status === "error");
}

export function isAttachmentRemovable(status: string) {
  return status === "queued" || status === "error";
}
