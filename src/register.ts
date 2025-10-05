import fs from 'node:fs';
import path from 'node:path';
import { Collection } from 'discord.js';

const CMD_DIRS = [
  'commands/core',
  'commands/shop',
  'commands/inventory',
  'commands/economy'
];

export async function registerAllCommands(collection: Collection<string, any>) {
  for (const dir of CMD_DIRS) {
    const full = path.join(process.cwd(), 'src', dir);
    if (!fs.existsSync(full)) continue;
    for (const file of fs.readdirSync(full)) {
      if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;
      const mod = await import(path.join(full, file));
      if (mod.default?.data?.name) {
        collection.set(mod.default.data.name, mod.default);
      }
      // also register handlers (namespaces for buttons/selects)
      if (mod.default?.ns) {
        collection.set(mod.default.ns, mod.default);
      }
    }
  }
}
