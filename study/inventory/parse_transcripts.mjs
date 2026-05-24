#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildInventory, discoverDefaultSources } from './inventory_core.mjs';

const OUTPUT_PATH = fileURLToPath(new URL('./tools_inventory.json', import.meta.url));

async function main() {
  const inventory = await buildInventory(discoverDefaultSources());

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(inventory, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
