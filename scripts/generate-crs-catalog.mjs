import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = new URL('../node_modules/epsg-index/all.json', import.meta.url);
const outputPath = new URL('../src/core/epsgCatalog.json', import.meta.url);
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const catalog = Object.fromEntries(
  Object.values(source)
    .filter(entry =>
      (entry.kind === 'CRS-PROJCRS' || entry.kind === 'CRS-GEOGCRS') &&
      typeof entry.proj4 === 'string' &&
      entry.proj4.length > 0,
    )
    .map(({ code, kind, name, proj4, unit, area }) => [
      code,
      { code, kind, name, proj4, unit, area },
    ]),
);

await writeFile(outputPath, `${JSON.stringify(catalog)}\n`);
