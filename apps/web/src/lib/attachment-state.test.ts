import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isAttachmentRemovable,
  retainAttachmentErrors,
} from './attachment-state.ts';

test('retainAttachmentErrors clears successful state and preserves errors', () => {
  const attachments = [
    { id: 'indexed', status: 'indexed', message: 'Indexed' },
    { id: 'pending', status: 'pending', message: 'Queued' },
    { id: 'failed', status: 'error', message: 'Retry from Timeline' },
  ];

  assert.deepEqual(retainAttachmentErrors(attachments), [attachments[2]]);
});

test('failed attachments remain removable after a diary is saved', () => {
  assert.equal(isAttachmentRemovable('queued'), true);
  assert.equal(isAttachmentRemovable('error'), true);
  assert.equal(isAttachmentRemovable('uploading'), false);
});
