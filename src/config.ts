import 'dotenv/config';

export const CONFIG = {
  token: process.env.DISCORD_TOKEN!,
  clientId: process.env.DISCORD_CLIENT_ID!,
  ownerId: process.env.BOT_OWNER_ID || '',
  marketCommissionRate: Math.min(0.5, Math.max(0, Number(process.env.MARKET_COMMISSION ?? 0.03))),
  eventChannelId: process.env.EVENT_CHANNEL_ID || '',
  eventPanelToken: process.env.EVENT_PANEL_TOKEN || '',
  eventSchedulerIntervalMs: Number(process.env.EVENT_SCHEDULER_INTERVAL_MS ?? 15000),
};
