/**
 * Queue names shared by the producer, the
 * plans service and the worker, so the queue
 * a job is written to and the queue it is
 * read from are the same constant, not two
 * strings that happen to match.
 */

import type { QueueName } from '@mcc/shared';

/** Serialises writes against Moodle. */
export const WRITE_QUEUE: QueueName = 'mcc.write';
