const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const encode = n => { const b = []; do { let part = n % 128; n = Math.floor(n / 128); if (n) part |= 128; b.push(part); } while (n); return b; };
const bytes = (tag, value) => [...encode(tag * 8 + 2), ...encode(value.length), ...value];
const num = (tag, value) => [...encode(tag * 8), ...encode(value)];
const str = (tag, value) => bytes(tag, [...Buffer.from(value)]);
const feature = (id, tags) => [
  ...num(1, id), ...bytes(2, tags.flatMap(encode)), ...num(3, 3),
  ...bytes(4, [9, 20, 20, 26, 20, 0, 0, 20, 19, 0, 15])
];
const layer = (name, items) => [
  ...str(1, name), ...items.flatMap(x => bytes(2, x)),
  ...str(3, 'ref'), ...str(3, 'name'),
  ...bytes(4, str(1, 'way/123')), ...bytes(4, str(1, 'Offices')),
  ...num(5, 4096), ...num(15, 2)
];
const tile = Uint8Array.from([...bytes(3, layer('roads', [feature(99, [0, 0])])), ...bytes(3, layer('buildings', [feature(1, [0, 0, 1, 1]), feature(2, [1, 1])]))]);
const source = fs.readFileSync(path.join(__dirname, '../scout-tile.js'), 'utf8');
const context = vm.createContext({ TextDecoder, Uint8Array, ArrayBuffer });
vm.runInContext(source, context);
const rows = context.CRCCScoutTile.decode(tile.buffer, '15/21617/18265');
assert.equal(rows.length, 2, 'roads excluded and both building polygons retained');
assert.equal(rows[0].ref, 'way/123');
assert.equal(rows[0].label, 'Offices');
assert.equal(rows[1].ref, 'tile/15/21617/18265/2', 'tile ID never masquerades as a game building-info ref');
assert(rows[0].footprintBounds.west < rows[0].footprintBounds.east);
assert(rows[0].footprintBounds.south < rows[0].footprintBounds.north);
assert.equal(context.CRCCScoutTile.decode(tile.buffer, 'broken').length, 0);
const generic = Uint8Array.from(bytes(3, [
  ...str(1, 'game-map'), ...bytes(2, feature(2 ** 57, [0, 0, 1, 1])),
  ...str(3, 'building'), ...str(3, 'name'), ...bytes(4, str(1, 'yes')),
  ...bytes(4, str(1, 'Offices')), ...num(5, 4096), ...num(15, 2)
]));
const genericRows=context.CRCCScoutTile.decode(generic.buffer,'15/21617/18265');
assert.equal(genericRows.length,1,'explicit building tag in a generic tile layer is accepted');
assert.equal(genericRows[0].label,'Offices');
assert.equal(genericRows[0].ref,'tile/15/21617/18265/feature/0','64-bit tile ID is parsed without claiming a canonical building ref');
assert.equal(context.CRCCScoutTile.inspect(generic.buffer)[0].name,'game-map');
assert.equal(context.CRCCScoutTile.inspect(generic.buffer)[0].features,1);

const src = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
const db = {};
const runCtx = vm.createContext({ URL, Date, console, setTimeout, clearTimeout, chrome: { storage: { local: { get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, db[k]])), set: async update => Object.assign(db, update) } } } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../scout-survey.js'), 'utf8'), runCtx);
vm.runInContext(src.slice(0, src.indexOf('async function recordHistory(')), runCtx);
vm.runInContext(src.slice(src.indexOf('function osmLabel('), src.indexOf('// ---- live market intelligence')), runCtx);
vm.runInContext(src.slice(src.indexOf('function objectWalk('), src.indexOf('async function storeObservation(')), runCtx);
vm.runInContext(src.slice(src.indexOf('async function storeObservation('), src.indexOf('async function saveShopHealth(')), runCtx);
const run = expression => vm.runInContext(expression, runCtx);
(async () => {
  runCtx.rows = rows;
  const url = 'https://play.capitalrift.com/api/maptile/15/21617/18265.mvt';
  await run('storeObservation({kind:"response",method:"GET",status:200,url:"' + url + '",ts:10000,data:{scoutMapTile:true,chunkId:"15/21617/18265",buildings:rows}})');
  assert.equal(db.crcc_scout_chunks_v1['15/21617/18265'].buildingRefs.length, 2);
  const view = run('scoutTileBounds("15/21617/18265")'); runCtx.view = view;
  let result = await run('surveyVisibleArea(view)');
  assert.equal(result.entities.filter(e => e.entityType === 'building').length, 2);
  runCtx.partial = { parts: [{ chunks: { '15/21617/18265': { parcels: [] } } }] };
  await run('storeObservation({kind:"response",method:"POST",status:200,url:"https://play.capitalrift.com/api/world",ts:12000,data:partial})');
  assert.equal(db.crcc_scout_chunks_v1['15/21617/18265'].buildingRefs.length, 2, 'land response preserves tile refs');
  assert.equal(db.crcc_scout_chunks_v1['15/21617/18265'].buildingsReported, true, 'partial land response does not erase tile coverage');
  runCtx.detail = { ref: 'way/123', label: 'Updated Offices', areaM2: 5500, busyness: 2.5, rentableUnits: [{ key: 'way/123/f0/room', kind: 'room', areaM2: 300, status: 'vacant' }] };
  await run('storeObservation({kind:"response",method:"GET",status:200,url:"https://play.capitalrift.com/api/building-info?ref=way%2F123",ts:14000,data:detail})');
  assert.equal(db.crcc_scout_index_v1['way/123'].label, 'Updated Offices');
  assert.equal(db.crcc_scout_index_v1['way/123'].chunkId, '15/21617/18265');
  await run('storeObservation({kind:"response",method:"GET",status:200,url:"' + url + '",ts:16000,data:{scoutMapTile:true,chunkId:"15/21617/18265",buildings:rows}})');
  assert.equal(db.crcc_scout_index_v1['way/123'].label, 'Updated Offices', 'tile refresh preserves richer observed label');
  result = await run('surveyVisibleArea(view)');
  assert.equal(result.entities.filter(e => e.entityType === 'room').length, 1);
  console.log('PASS: vector footprint decoding, only buildings, stable refs, tile/land arrival order, enriched room details');
})().catch(error => { console.error(error); process.exitCode = 1; });
