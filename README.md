# Virkz — Bot de Discord (Economía + RPG) con **V Coins**

Bot avanzado en **TypeScript + discord.js v14 + Prisma + PostgreSQL**. Global por usuario (funciona en todos tus servidores).
Inventario inicia vacío (sin pico, sin caña, sin armas/armadura). Debes comprar herramientas en la tienda. El acceso a **minas** y **zonas de pesca**
depende del **nivel de tu herramienta**.

## 🚀 Puesta en marcha (Replit, Railway/Supabase)
1) **Crea la BD Postgres** gratis (Railway o Supabase) y copia la `DATABASE_URL`.
2) En **Discord Developer Portal**, crea el bot, pega el token y el client ID en `.env`.
3) En Replit (o local):
   ```bash
   npm i
   npm run prisma:gen
   npm run db:push
   npm run db:seed
   npm run deploy:commands
   npm run dev
   ```
4) Invita el bot con permisos `bot` + `applications.commands`.

## ✅ Funciones claves implementadas en esta versión
- `/start`, `/profile`, `/help`, `/daily`
- `/shop`, `/buy`, `/inventory`, `/equip`
- `/mine` (minijuego de golpes con anti-spam), `/fish` (tensión con clicks)
- **Gating por herramienta y tier**: solo entras en minas/zonas si tu **pico/caña** cumplen el requisito.
- **Moneda**: *V Coins* (almacenada como `vcoins`).
- **Global por usuario**: datos por `userId` (no por servidor).
- **Anti-cheat básico**: límites de tiempo/clicks y aleatoriedad.

> Nota: Es una base avanzada y ampliable (raids, clanes, etc.). Ya trae estructura para seguir creciendo.

---

## 🔧 Estructura
```
/src
  index.ts
  config.ts
  deploy-commands.ts
  lib/db.ts
  services/
    cooldowns.ts
    antiCheat.ts
  data/
    items.json
    locations.json
  commands/
    core/{start,profile,help,daily}.ts
    shop/{shop,buy}.ts
    inventory/{inventory,equip}.ts
    economy/{mine,fish,work}.ts
  interactions/
    buttons/{mine,fish,work}.ts
    select-menus/{mineLocation,fishLocation}.ts
```

## 🔒 Admin
No hay comandos de admin públicos. La lógica de “propietario” se controla con `BOT_OWNER_ID` si deseas agregar alguno privado.

---

## 🧪 Semillas (seed)
- Items: picos (madera→mítico), cañas (básica→élite), consumibles y materiales.
- Zonas: minas y pesqueros con `requiredTier`.
- Saldo inicial: 100 **V Coins**.

¡Listo para jugar! 🎮
