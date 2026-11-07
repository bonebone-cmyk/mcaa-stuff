import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Every page is rendered per request from the database, so no incremental (ISR) cache is configured.
export default defineCloudflareConfig({});
