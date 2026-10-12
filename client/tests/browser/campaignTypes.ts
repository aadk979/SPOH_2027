import type { Page } from '@playwright/test';
export interface CampaignResponse {
  path: string;
  method?: 'GET' | 'POST';
  query?: Record<string, string>;
  body: unknown;
  status?: number;
  contentType?: string;
}
export interface CampaignFixture { url: string; expectedUrl: string; ready(): Promise<void>; unexpected: string[] }
export interface CampaignContext { eventId: string; personId: string; now: string; routePath: string }
export type CampaignReady = (page: Page) => Promise<void>;
