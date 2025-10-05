import 'dotenv/config';

export const CONFIG = {
  token: process.env.DISCORD_TOKEN!,
  clientId: process.env.DISCORD_CLIENT_ID!,
  ownerId: process.env.BOT_OWNER_ID || '',
};
