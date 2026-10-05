/**
 * @mcc/shared — contracts shared by the API, the worker and the web app.
 *
 * The API validates with the same schemas the web app renders with, and the
 * permission catalogue lives here so guards, seeds and route metadata cannot
 * drift apart.
 */

export * from './auth/index.js';
export * from './core/index.js';
export * from './moodle/index.js';
export * from './tenancy/index.js';