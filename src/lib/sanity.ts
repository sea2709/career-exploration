import { sanityClient } from 'sanity:client';

/** Read-only client; the O*NET dataset is public so no token is needed. */
export const sanity = sanityClient;
