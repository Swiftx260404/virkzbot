import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { CONFIG } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

async function loadSlashJson(): Promise<any[]> {
  const commands: any[] = [];
  const cmdDirs = ['commands/core','commands/shop','commands/inventory','commands/economy'];
  for (const dir of cmdDirs) {
    const full = path.join(process.cwd(), 'src', dir);
    if (!fs.existsSync(full)) continue;
    for (const file of fs.readdirSync(full)) {
      if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;
      const mod = await import(path.join(full, file));
      if (mod.default?.data?.toJSON) {
        commands.push(mod.default.data.toJSON());
      }
    }
  }
  return commands;
}

async function main() {
  const rest = new REST({ version: '10' }).setToken(CONFIG.token);
  const body = await loadSlashJson();
  console.log(`Registrando ${body.length} comandos (globales)...`);
  const res = await rest.put(Routes.applicationCommands(CONFIG.clientId), { body }) as any;
  console.log('Hecho.', res?.length ?? '');
}

main().catch(console.error);
