/* Decode only building footprints from the game's vector map tiles. No raw tile is retained. */
globalThis.CRCCScoutTile = (() => {
  function reader(bytes) {
    let pos = 0;
    // Feature IDs may use the full protobuf uint64 range. Only small values
    // are used as tile identities; large ones still need to be read safely.
    const varint = () => { let value = 0, shift = 0, byte; do { if (pos >= bytes.length || shift >= 70) throw new Error('Invalid vector tile'); byte = bytes[pos++]; value += (byte & 127) * 2 ** shift; shift += 7; } while (byte & 128); return value; };
    const fields = (end, visit) => { while (pos < end) { const tag = varint(), field = Math.floor(tag / 8), wire = tag % 8; if (wire === 0) visit(field, wire, varint()); else if (wire === 1 || wire === 5) { pos += wire === 1 ? 8 : 4; } else if (wire === 2) { const length = varint(), start = pos; pos += length; if (pos > end) throw new Error('Invalid vector tile length'); visit(field, wire, bytes.subarray(start, pos)); } else throw new Error('Unsupported vector tile field'); } };
    return { fields, varint, get position() { return pos; } };
  }
  const utf8 = new TextDecoder();
  const string = bytes => utf8.decode(bytes);
  const isBuildingLayer = name => /(?:buildings?|structures?)/i.test(name);
  const isExplicitBuilding = attrs => {
    const building = attrs.building;
    if (building != null && building !== false && building !== 0 && !['no', 'false', '0'].includes(String(building).toLowerCase())) return true;
    return ['kind', 'type', 'class', 'category', 'featureType'].some(key => /^(?:building|structure|building[-_ ]?footprint)$/i.test(String(attrs[key] || '')));
  };
  function value(bytes) { let result = null; reader(bytes).fields(bytes.length, (field, wire, v) => { if (wire === 2 && field === 1) result = string(v); else if (wire === 0 && (field === 4 || field === 5 || field === 6 || field === 7)) result = field === 7 ? !!v : v; }); return result; }
  function geometry(bytes, tileX, tileY, zoom, extent) {
    const r = reader(bytes), packed = [];
    while (r.position < bytes.length) packed.push(r.varint());
    let x = 0, y = 0, i = 0, west = Infinity, east = -Infinity, north = -Infinity, south = Infinity, points = 0;
    const size = 2 ** zoom, decode = n => n % 2 ? -(n + 1) / 2 : n / 2;
    while (i < packed.length) {
      const command = packed[i++], op = command % 8, count = Math.floor(command / 8);
      if (op === 7) continue;
      if ((op !== 1 && op !== 2) || i + count * 2 > packed.length) break;
      for (let j = 0; j < count; j++) { x += decode(packed[i++]); y += decode(packed[i++]); west = Math.min(west, x); east = Math.max(east, x); north = Math.max(north, y); south = Math.min(south, y); points++; }
    }
    if (!points) return null;
    const lon = n => (tileX + n / extent) / size * 360 - 180;
    const lat = n => Math.atan(Math.sinh(Math.PI * (1 - 2 * (tileY + n / extent) / size))) * 180 / Math.PI;
    const bounds = { west: lon(west), east: lon(east), north: lat(south), south: lat(north) };
    return { lat: lat((south + north) / 2), lon: lon((west + east) / 2), footprintBounds: bounds };
  }
  function decode(buffer, chunkId) {
    const match = /^(\d{1,2})\/(\d+)\/(\d+)$/.exec(chunkId || ''); if (!match) return [];
    const [zoom, tileX, tileY] = match.slice(1).map(Number), buildings = [], seen = new Set();
    const tile = new Uint8Array(buffer);
    reader(tile).fields(tile.length, (field, wire, layerData) => {
      if (field !== 3 || wire !== 2) return;
      let name = '', extent = 4096; const keys = [], values = [], features = [];
      reader(layerData).fields(layerData.length, (key, kind, data) => {
        if (key === 1 && kind === 2) name = string(data);
        else if (key === 2 && kind === 2) features.push(data);
        else if (key === 3 && kind === 2) keys.push(string(data));
        else if (key === 4 && kind === 2) values.push(value(data));
        else if (key === 5 && kind === 0) extent = data;
      });
      if (!Number.isFinite(extent) || extent < 128) return;
      const dedicated = isBuildingLayer(name),hasBuildingTags = dedicated || keys.some(key => ['building', 'kind', 'type', 'class', 'category', 'featureType'].includes(key));
      if (!hasBuildingTags) return;
      for (const [featureIndex, bytes] of features.slice(0, 3000).entries()) {
        let id = null, shape = null, type = 0; const attrs = Object.create(null);
        reader(bytes).fields(bytes.length, (key, kind, data) => {
          if (key === 1 && kind === 0) id = data;
          else if (key === 3 && kind === 0) type = data;
          else if (key === 4 && kind === 2) shape = data;
          else if (key === 2 && kind === 2) { const tags = [], tagReader = reader(data); while (tagReader.position < data.length) tags.push(tagReader.varint()); for (let i = 0; i + 1 < tags.length; i += 2) if (keys[tags[i]] != null) attrs[keys[tags[i]]] = values[tags[i + 1]]; }
        });
        if (type !== 3 || !shape || !dedicated && !isExplicitBuilding(attrs)) continue;
        const explicit = [attrs.ref, attrs.buildingRef, attrs.osm_ref].find(x => typeof x === 'string' && /^(?:way|relation)\/\d+$/.test(x)) ||
          (['way', 'relation'].includes(attrs.osm_type) && Number.isSafeInteger(Number(attrs.osm_id)) && Number(attrs.osm_id) > 0 ? `${attrs.osm_type}/${attrs.osm_id}` : null);
        const ref = explicit || `tile/${chunkId}/${Number.isSafeInteger(id) && id > 0 ? id : `feature/${featureIndex}`}`;
        if (seen.has(ref)) continue;
        const position = geometry(shape, tileX, tileY, zoom, extent);
        if (!position) continue;
        seen.add(ref);
        const row = { ref, chunkId, label: String(attrs.label || attrs.name || 'Map building'), ...position };
        if (Number.isFinite(Number(attrs.areaM2)) && attrs.areaM2 != null) row.areaM2 = Number(attrs.areaM2);
        buildings.push(row);
      }
    });
    return buildings;
  }
  function inspect(buffer) {
    const bytes = new Uint8Array(buffer), layers = [];
    reader(bytes).fields(bytes.length, (field, wire, data) => {
      if (field !== 3 || wire !== 2) return;
      const layer = { name: '', features: 0, keys: [] };
      reader(data).fields(data.length, (key, kind, item) => {
        if (key === 1 && kind === 2) layer.name = string(item);
        else if (key === 2 && kind === 2) layer.features++;
        else if (key === 3 && kind === 2 && layer.keys.length < 60) layer.keys.push(string(item));
      });
      layers.push(layer);
    });
    return layers;
  }
  return { decode, inspect };
})();
