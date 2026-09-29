/* Capital Rift Command Center v0.8.0
   Normal Capital Rift scouting/analytics reads are GET-only. Optional game-state
   writes are shop/building renames and land purchases; every write path is
   learned from an official UI action first and land batches require an explicit
   user confirmation. Camera navigation is local page control. */
if(typeof importScripts==='function')importScripts('scout-survey.js','land-buyer.js','region-data.js','chat-intel.js','transaction-log.js');

const GAME_ORIGIN='https://play.capitalrift.com';
const API=GAME_ORIGIN+'/api';
const KEY='crcc_snapshot_v4';
const LAST_COMPANY_KEY='crcc_last_company_account_v1';
const REGION_INTEL_KEY='crcc_region_intel_v1';
const REGION_INFO_KEY='crcc_region_info_v1';
const SHOP_HISTORY_KEY='crcc_shop_history_v1';
const HISTORY_KEY='crcc_history_v4';
const HOURLY_KEY='crcc_hourly_v4';
const RENAME_KEY='crcc_rename_template_v4';
const LEARN_KEY='crcc_rename_learning_v4';
const BUILDING_RENAME_KEY='crcc_building_rename_template_v1';
const BUILDING_LEARN_KEY='crcc_building_rename_learning_v1';
const GROSS_REBASE_KEY='crcc_gross_rebase_v1';
const GEO_KEY='crcc_geo_cache_v3';
const PLAYER_TRACK_KEY='crcc_player_track_v4';
const HEALTH_KEY='crcc_shop_health_v4';
const SHOP_STOCK_KEY='crcc_shop_stock_v1';
const OBS_KEY='crcc_observed_v4';
const BUILDING_INTEL_KEY='crcc_building_intel_v4';
const RENT_MARKET_KEY='crcc_rent_market_v1';
const MARKET_KEY='crcc_market_intel_v4';
const IPO_KEY='crcc_ipo_market_v1';
const PARCEL_INTEL_KEY='crcc_scout_parcels_v1';
const UNIT_INTEL_KEY='crcc_retail_units_v1';
const SCOUT_INDEX_KEY='crcc_scout_index_v1';
const SCOUT_ACCOUNT_KEY='crcc_scout_accounts_v1';
const SCOUT_CHUNK_KEY='crcc_scout_chunks_v1';
const SCOUT_UNIT_PREFIX='crcc_scout_unit_v1:';
const CHAT_INTEL_KEY='crcc_chat_intel_v1';
const TRANSACTION_LOG_KEY='crcc_company_transaction_log_v1';
const NAV_KEY='crcc_navigation_v4';
const NAV_ANCHOR_KEY='crcc_navigation_anchors_v5';
const WATCH_KEY='crcc_market_watch_v4';
const MARKET_SCAN_KEY='crcc_market_scan_v1';
const MARKET_SCAN_PROGRESS_KEY='crcc_market_scan_progress_v1';
const PROPERTY_BUYERS_KEY='crcc_property_buyers_v1';
const LAND_BUY_TEMPLATE_KEY='crcc_land_buy_template_v1';
const LAND_BUY_LEARN_KEY='crcc_land_buy_learning_v1';
const LAND_BUY_SESSION_KEY='crcc_land_buy_session_v1';
const LAND_BUY_HISTORY_KEY='crcc_land_buy_history_v1';
const OSM_REF_KEY='crcc_osm_ref_cache_v1';
const ASSET_OBS_KEY='crcc_asset_observed_v1';
const SHOP_ROW_CAP=4000;
let scoutDataRevision=0;
let transactionLogWrites=Promise.resolve();
let activeLandBuySession=null;
const HISTORY_CAP=9000; // 30 days at 5-minute cadence ~= 8640
const HOURLY_CAP=744;   // about 31 days

const arr=v=>Array.isArray(v)?v:[];
const finite=v=>v!=null&&v!==''&&Number.isFinite(Number(v));
const num=(v,d=0)=>finite(v)?Number(v):d;
const text=(v,d='')=>v==null?d:String(v);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pick=(o,ks,d=null)=>{for(const k of ks)if(o&&o[k]!=null&&o[k]!=='')return o[k];return d;};
const norm=s=>text(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
// A partial /me response must not discard the last known operational account.
// An uncertain identity is display-only; write paths require a fresh ID.
function activeAccountFromMe(me,previousCompanyId=null){
  if(me?.tutorial)return{scope:'character',id:me.playerId,uncertain:false};
  const pilot=me?.piloting,active=me?.activeAccount;
  const id=pilot?.companyId??pilot?.company?.id??(pilot?.kind==='company'?pilot.id:null)??(active?.kind==='company'?active.companyId??active.id:null);
  if(id)return{scope:'company',id,uncertain:false};
  if(pilot)return{scope:'company',id:previousCompanyId||null,uncertain:true};
  if(!Object.prototype.hasOwnProperty.call(me||{},'piloting')&&previousCompanyId&&!active)return{scope:'company',id:previousCompanyId,uncertain:true};
  return{scope:'character',id:me?.playerId,uncertain:!me?.playerId};
}
const humanKey=k=>text(k).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
function findDeep(obj,names,maxDepth=4){const want=new Set(names.map(x=>String(x).toLowerCase()));let found=null;const walk=(v,d)=>{if(found!=null||v==null||d>maxDepth)return;if(Array.isArray(v)){for(const x of v){walk(x,d+1);if(found!=null)return;}return;}if(typeof v!=='object')return;for(const[k,x]of Object.entries(v)){if(want.has(String(k).toLowerCase())&&x!=null&&x!==''){found=x;return;}if(x&&typeof x==='object')walk(x,d+1);if(found!=null)return;}};walk(obj,0);return found;}
function allDeep(obj,pred,maxDepth=4){const out=[];const walk=(v,d,path)=>{if(v==null||d>maxDepth)return;if(Array.isArray(v)){v.forEach((x,i)=>walk(x,d+1,`${path}[${i}]`));return;}if(typeof v!=='object')return;for(const[k,x]of Object.entries(v)){const p=path?`${path}.${k}`:k;if(pred(k,x,p))out.push({key:k,value:x,path:p});if(x&&typeof x==='object')walk(x,d+1,p);}};walk(obj,0,'');return out;}
function validCoord(lat,lon){return finite(lat)&&finite(lon)&&Math.abs(Number(lat))<=85.06&&Math.abs(Number(lon))<=180&&!(Math.abs(Number(lat))<0.00001&&Math.abs(Number(lon))<0.00001);}
function coordsFrom(o){if(!o||typeof o!=='object')return{lat:null,lon:null};let lat=pick(o,['lat','latitude'],o?.center?.lat),lon=pick(o,['lon','lng','longitude'],o?.center?.lon??o?.center?.lng);if(!validCoord(lat,lon)&&Array.isArray(o.coordinates)&&o.coordinates.length>=2){const a=Number(o.coordinates[0]),b=Number(o.coordinates[1]);if(validCoord(b,a)){lat=b;lon=a;}else if(validCoord(a,b)){lat=a;lon=b;}}return validCoord(lat,lon)?{lat:Number(lat),lon:Number(lon)}:{lat:null,lon:null};}
function propertyRefOf(o){return pick(o,['buildingRef','propertyRef','buildingId','ref'],null);}
function propertyLabelOf(o,allowGenericName=true){const direct=pick(o,['buildingLabel','buildingName','propertyLabel','propertyName','placeName','address'],null);if(direct)return direct;if(allowGenericName)return pick(o,['label','name','title'],null);return null;}


async function gameGet(path){
  const url=path.startsWith('http')?path:API+path;
  if(!url.startsWith(API+'/'))throw new Error('Blocked non-Capital-Rift game URL.');
  const res=await fetch(url,{method:'GET',credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
  if(!res.ok)throw new Error(`HTTP ${res.status}: ${url.replace(API,'')}`);
  return res.json();
}
async function jsonFetch(url,init={}){
  const res=await fetch(url,{...init,cache:'no-store',headers:{Accept:'application/json',...(init.headers||{})}});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function trimValue(v,depth=0,cap=120){
  if(v==null||['string','number','boolean'].includes(typeof v))return v;
  if(depth>=8)return undefined;
  if(Array.isArray(v))return v.slice(0,cap).map(x=>trimValue(x,depth+1,cap)).filter(x=>x!==undefined);
  if(typeof v==='object'){const out={};for(const[k,x]of Object.entries(v)){const t=trimValue(x,depth+1,cap);if(t!==undefined)out[k]=t;}return out;}
}
const trimRow=v=>trimValue(v,0)||{};

function sourceBlock(rows,metric,cap=800){
  const list=arr(rows),score=r=>num(r?.[metric]);
  return{count:list.length,perMin:list.reduce((s,r)=>s+score(r),0),rows:[...list].sort((a,b)=>score(b)-score(a)).slice(0,cap).map(trimRow)};
}
function summarizeIncome(income){
  const r=income?.rates||income||{},src=income?.sources||{};
  return{rates:{grossPerMin:num(r.grossPerMin),ingredientCostPerMin:num(r.ingredientCostPerMin),wagePerMin:num(r.wagePerMin),rentPerMin:num(r.rentPerMin),rentIncomePerMin:num(r.rentIncomePerMin),netPerMin:num(r.netPerMin),interestPerMin:num(r.interestPerMin),dayRevenue:num(r.dayRevenue),logisticsWagePerMin:num(r.logisticsWagePerMin)},sources:{shops:sourceBlock(src.shops,'grossPerMin',SHOP_ROW_CAP),restaurants:sourceBlock(src.restaurants,'grossPerMin'),carts:sourceBlock(src.carts,'grossPerMin'),rentIncome:sourceBlock(src.rentIncome,'perMin',2500),leases:sourceBlock(src.leases,'perMin'),savings:sourceBlock(src.savings,'perMin'),crews:sourceBlock(src.crews,'wagePerMin'),drivers:sourceBlock(src.drivers,'effectivePerMin'),freight:{dayEarned:num(src.freight?.dayEarned),earnedPerMin:num(src.freight?.earnedPerMin),paidPerMin:num(src.freight?.paidPerMin)}},royalty:{lifetime:num(income?.royalty?.lifetime),pendingDay:num(income?.royalty?.pendingDay)}};
}
function summarizeHistory(hist,hourly=null){
  const rows=arr(hist?.rows);let inflow=0,outflow=0;const byKind=new Map();
  for(const r of rows){const i=num(r?.inflow),o=num(r?.outflow),k=r?.kind||'other';inflow+=i;outflow+=o;const x=byKind.get(k)||{kind:k,inflow:0,outflow:0,count:0};x.inflow+=i;x.outflow+=o;x.count++;byKind.set(k,x);}
  return{rows:rows.slice(-720).map(trimRow),bucket:hist?.bucket||'day',hourlyRows:arr(hourly?.rows).slice(-1200).map(trimRow),totals:{inflow,outflow,net:inflow-outflow},byKind:[...byKind.values()].map(x=>({...x,net:x.inflow-x.outflow})).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net))};
}
function cashflowForRange(history,range,now=Date.now()){
  const hours=arr(history?.hourlyRows),daily=arr(history?.rows),useHours=range==='24h'&&hours.length>0,rows=useHours?hours:daily;
  const days=range==='30d'?30:range==='7d'?7:1;
  const start=useHours?now-86400000:Math.floor(now/86400000)*86400000-(days-1)*86400000;
  const byKind=new Map();let inflow=0,outflow=0,count=0;
  for(const r of rows){const t=Number(r?.t);if(!Number.isFinite(t)||t<start||t>now)continue;
    const i=r?.inflow!=null&&finite(r.inflow)?Number(r.inflow):0,o=r?.outflow!=null&&finite(r.outflow)?Number(r.outflow):0,k=text(r?.kind,'other');
    inflow+=i;outflow+=o;count++;const old=byKind.get(k)||{kind:k,inflow:0,outflow:0};old.inflow+=i;old.outflow+=o;byKind.set(k,old);
  }
  return{inflow,outflow,net:inflow-outflow,count,bucket:useHours?'hour':history?.bucket||'day',rangeLabel:useHours?'Last 24 hours':range==='24h'?'Current UTC day':`Last ${days} UTC days`,byKind:[...byKind.values()].map(x=>({...x,net:x.inflow-x.outflow})).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net))};
}

function extractAssetRows(game){
  const candidates=[game?.netWorthBreakdown,game?.netWorthBreakdownItems,game?.assetBreakdown,game?.assetsBreakdown];
  const rows=[];const seen=new Set();
  const add=(key,label,value,source='game')=>{if(!finite(value))return;value=Number(value);if(value<0)return;const nk=norm(key||label);if(!nk||seen.has(nk))return;seen.add(nk);rows.push({key:key||label,label:label||humanKey(key),value,source});};
  const walk=c=>{if(!c)return;if(Array.isArray(c))for(const x of c){if(!x||typeof x!=='object')continue;const value=pick(x,['value','amount','total','worth','bookValue','marketValue','appraisedValue','purchasePrice'],null),key=pick(x,['key','id','type','category','name','label'],'asset');add(key,pick(x,['label','name','title'],humanKey(key)),value);}else if(typeof c==='object')for(const[k,v]of Object.entries(c)){if(finite(v))add(k,humanKey(k),v);else if(v&&typeof v==='object'&&!Array.isArray(v)){const value=pick(v,['value','amount','total','worth','bookValue','marketValue','appraisedValue','purchasePrice'],null);if(finite(value))add(k,pick(v,['label','name','title'],humanKey(k)),value);}}};
  candidates.forEach(walk);
  [['cash','Cash',game?.cash],['rentalPropertyValue','Rental property value',game?.rentalPropertyValue],['buildingsValue','Buildings',game?.buildingsValue],['roomsValue','Rooms',game?.roomsValue],['marketListingsValue','Market listings',game?.marketListingsValue],['sharePortfolioValue','Public shares',game?.sharePortfolioValue],['goodsInStorageValue','Goods in storage',game?.goodsInStorageValue],['landValue','Land',game?.landValue],['vehicleValue','Vehicles',game?.vehicleValue]].forEach(([k,l,v])=>add(k,l,v,'game-field'));
  const total=num(game?.netWorth,NaN),sum=rows.reduce((s,r)=>s+r.value,0);
  if(Number.isFinite(total)&&total>=0&&total-sum>Math.max(1,total*0.002))add('reconciliation','Reconciliation difference',Math.max(0,total-sum),'difference');
  if(!rows.length&&Number.isFinite(total)){add('cash','Cash',game?.cash,'game-field');const rest=total-num(game?.cash);if(rest>0)add('reconciliation','Reconciliation difference',rest,'difference');}
  return rows.sort((a,b)=>b.value-a.value);
}

function assetValueOf(o){
  if(!o||typeof o!=='object')return null;
  const v=pick(o,['purchaseAppraisal','purchaseAppraisedValue','appraisedValue','purchasePrice','pricePaid','acquisitionPrice','acquiredFor','bookValue','assetValue','value','price'],null);
  return v!==null&&finite(v)&&Number(v)>=0?Number(v):null;
}
const ASSET_KINDS={land:'land',building:'buildings',property:'buildings',room:'rooms',parcel:'land',landholdings:'land',ownedland:'land',landparcels:'land',parcels:'land',buildings:'buildings',ownedbuildings:'buildings',buildingholdings:'buildings',buildingdeeds:'buildings',deeds:'buildings',rooms:'rooms',ownedrooms:'rooms',roomholdings:'rooms',roomsowned:'rooms',purchasedrooms:'rooms',roomassets:'rooms'};
function assetKind(k){return ASSET_KINDS[norm(k).replace(/ /g,'')]||null;}
function assetAliases(o,kind){
  const keys=kind==='land'?['chunkId','parcelId','landId','id','ref']:kind==='buildings'?['buildingRef','buildingId','propertyRef','id','ref']:['unitKey','roomKey','roomId','unitId','id','ref'];
  return keys.filter(k=>o?.[k]!=null&&String(o[k])!=='').flatMap(k=>{
    const raw=String(o[k]),normalized=kind==='land'&&raw.startsWith('parcel/')?raw.slice(7):raw;
    return[`${k}:${raw}`,`asset:${kind}:${raw}`,`asset:${kind}:${normalized}`];
  });
}
function assetRecord(kind,o,parent=null,source='account'){
  if(!o||typeof o!=='object'||Array.isArray(o))return null;
  const ids=assetAliases(o,kind),c=coordsFrom(o);
  return{id:ids[0]||null,aliases:ids,ref:pick(o,kind==='land'?['chunkId','parcelId','landId','id','ref']:kind==='buildings'?['buildingRef','buildingId','propertyRef','id','ref']:['unitKey','roomKey','roomId','unitId','id','ref'],null),label:assetLabelOf(o,kind==='land'?'Land parcel':kind==='buildings'?'Building':'Room'),value:assetValueOf(o),floor:pick(o,['floor','floorIndex','level'],null),area:pick(o,['area','areaM2','sqm','floorArea'],null),lat:c.lat,lon:c.lon,parentRef:parent?pick(parent,['buildingRef','buildingId','propertyRef','chunkId','parcelId','id','ref'],null):null,raw:trimRow(o),source};
}
function assetLabelOf(o,fallback){return text(pick(o,['buildingLabel','buildingName','propertyLabel','propertyName','label','name','title'],fallback));}
function emptyInventory(source){return{land:[],buildings:[],rooms:[],source};}
function extractOfficialAssetInventory(game){
  const out=emptyInventory('game-assets');
  // /game/:id.assets is the actual Assets-menu ledger. In the observed game
  // payload it calls building deeds `property` and their IDs are way/... .
  for(const asset of arr(game?.assets)){
    const kind=assetKind(asset?.kind);if(!kind)continue;
    const row=assetRecord(kind,asset,null,'assets-menu');if(row)out[kind].push(row);
  }
  for(const land of arr(game?.landHoldings)){out.land.push(assetRecord('land',land));for(const b of arr(land?.buildings))out.buildings.push(assetRecord('buildings',b,land));}
  for(const key of ['ownedBuildings','buildingHoldings','buildings'])for(const b of arr(game?.[key]))out.buildings.push(assetRecord('buildings',b));
  for(const key of ['ownedRooms','roomHoldings','roomsOwned','purchasedRooms','roomAssets'])for(const r of arr(game?.[key]))out.rooms.push(assetRecord('rooms',r));
  // A listing is not proof of room ownership unless acquisition data is present.
  for(const r of arr(game?.listings))if(pick(r,['pricePaid','purchasePrice','purchaseAppraisal','appraisedValue','assetValue','bookValue'],null)!=null)out.rooms.push(assetRecord('rooms',r));
  return mergeAssetInventories(out);
}
function extractObservedAssetInventory(cache,accountId){
  const out=emptyInventory('observed-assets-menu'),unknownCaptured=new Set();
  const entries=Object.entries(cache||{}).sort((a,b)=>num(b[1]?.at)-num(a[1]?.at));
  for(const [url,rec] of entries){
    if(!rec?.data||String(rec.accountId)!==String(accountId)||!/(asset|holding|land|building|room|property)/i.test(url)||Date.now()-num(rec.at)>2*3600000)continue;
    // Category comes from the official section/collection key or explicit section
    // type. Never infer ownership type from an individual asset's display name.
    const walk=(v,ctx=null,parent=null,depth=0)=>{
      if(!v||depth>8)return;
      if(Array.isArray(v)){if(ctx)for(const item of v){const row=assetRecord(ctx,item,parent,'assets-menu');if(row&&(row.aliases.length||!unknownCaptured.has(ctx)))out[ctx].push(row);}if(ctx&&v.some(item=>item&&typeof item==='object'&&!assetAliases(item,ctx).length))unknownCaptured.add(ctx);
        else for(const item of v)walk(item,null,parent,depth+1);return;}
      if(typeof v!=='object')return;
      const explicit=assetKind(pick(v,['category','section','assetCategory','assetType','type'],''));
      const section=explicit||(Array.isArray(v.items)||Array.isArray(v.entries)?assetKind(pick(v,['title','label','name'],'')):null)||ctx;
      if(!ctx&&explicit&&assetAliases(v,explicit).length){const row=assetRecord(explicit,v,parent,'assets-menu');if(row)out[explicit].push(row);}
      for(const [key,value] of Object.entries(v)){
        const kind=assetKind(key);
        if(kind&&value&&typeof value==='object'){walk(value,kind,v,depth+1);if(kind==='land')for(const land of arr(value))walk(land?.buildings,'buildings',land,depth+1);}
        else if(['items','entries','holdings','assets','sections','categories','data','result'].includes(key))walk(value,section,v,depth+1);
      }
    };
    const urlSection=/\/(land|buildings|rooms)(?:[/?#]|$)/i.exec(url)?.[1]||/[?&](?:category|section)=(land|buildings|rooms)(?:&|$)/i.exec(url)?.[1];
    walk(rec.data,assetKind(urlSection));
  }
  return mergeAssetInventories(out);
}
function mergeAssetInventories(...inventories){
  const out=emptyInventory('assets-menu');
  for(const kind of ['land','buildings','rooms']){
    const rows=[];
    for(const inv of inventories)for(const x of arr(inv?.[kind]))if(x&&typeof x==='object'){
      const aliases=arr(x.aliases).length?x.aliases:(x.id?[String(x.id)]:[]);
      const found=aliases.length?rows.find(y=>aliases.some(a=>arr(y.aliases).includes(a))):null;
      if(found){for(const field of ['value','label','ref','floor','area','lat','lon','parentRef'])if((found[field]==null||found[field]==='')&&x[field]!=null)found[field]=x[field];found.aliases=[...new Set([...arr(found.aliases),...aliases])];}
      else rows.push({...x,aliases});
    }
    out[kind]=rows.map((x,i)=>({...x,id:x.id||`${kind}:unidentified:${i}`}));
  }
  return out;
}

function classifyNetWorth(rows,properties,total,assetInventory=null){
  const inv=assetInventory||{land:[],buildings:[],rooms:[]};
  const valuedKinds=new Set(['land','buildings','rooms'].filter(k=>arr(inv[k]).some(x=>x.value!=null&&finite(x.value))));
  const detailedRealEstate=valuedKinds.size>0;
  const labels=new Set(arr(properties).flatMap(p=>[norm(p.label),norm(p.ref)]).filter(Boolean));
  const out={cash:[],land:[],buildings:[],rooms:[],vehicles:[],publicShares:[],otherAssets:[],reconciliation:[]};
  for(const r of arr(rows)){
    const s=norm(`${r.key} ${r.label}`);let k='otherAssets';
    if(r.source==='difference'||/reconciliation|unclassified|inferred remainder/.test(s))k='reconciliation';
    else if(/\bcash\b|bank balance|money/.test(s))k='cash';
    else if(/share|stock|equity|portfolio/.test(s))k='publicShares';
    else if(/vehicle|truck|sedan|car|van|ship|boat|tractor|forklift/.test(s))k='vehicles';
    else if(/landvalue|land holdings|land parcels/.test(s))k='land';
    else if(/buildingsvalue|building holdings|owned buildings/.test(s))k='buildings';
    else if(/roomsvalue|room holdings|owned rooms/.test(s))k='rooms';
    // When Assets holdings provide item-level real estate, ignore aggregate/heuristic
    // real-estate rows so they cannot double count the same property.
    if(valuedKinds.has(k))continue;
    if(detailedRealEstate&&k==='otherAssets'&&[...arr(inv.land),...arr(inv.buildings),...arr(inv.rooms)].some(x=>norm(x.label)===norm(r.label)&&x.value!=null&&Number(x.value)===Number(r.value)))continue;
    out[k].push(r);
  }
  if(detailedRealEstate){
    const mapRows=(kind,rows)=>arr(rows).filter(x=>x.value!=null&&finite(x.value)).map((x,i)=>({key:x.id||`${kind}:${i}`,label:x.label||humanKey(kind),value:Number(x.value),source:'assets-menu',ref:x.ref??null,floor:x.floor??null,area:x.area??null}));
    for(const kind of valuedKinds)out[kind]=mapRows(kind,inv[kind]);
  }
  const sum=k=>out[k].reduce((s,r)=>s+num(r.value),0),realEstate=sum('land')+sum('buildings')+sum('rooms');
  const known=sum('cash')+realEstate+sum('vehicles')+sum('publicShares')+sum('otherAssets');
  let reconciliation=sum('reconciliation');
  if(finite(total)&&Math.abs(num(total)-known-reconciliation)>1)reconciliation+=num(total)-known-reconciliation;
  return{total:num(total),cash:sum('cash'),realEstate:{total:realEstate,land:sum('land'),buildings:sum('buildings'),rooms:sum('rooms'),details:{land:out.land,buildings:out.buildings,rooms:out.rooms},counts:{land:arr(inv.land).length,buildings:arr(inv.buildings).length,rooms:arr(inv.rooms).length},source:detailedRealEstate?'assets-menu':'fallback-breakdown'},vehicles:sum('vehicles'),publicShares:sum('publicShares'),otherAssets:sum('otherAssets'),reconciliation,details:{cash:out.cash,vehicles:out.vehicles,publicShares:out.publicShares,otherAssets:out.otherAssets,reconciliation:out.reconciliation}};
}

function extractAnchors(game,income){
  const found=new Map();
  const merge=(ref,label,obj,source)=>{
    if(ref==null&&!label)return;
    const trustCoords=/^game:(propertyAnchors|buildings|ownedBuildings|properties|buildingHoldings|landHoldings)$/.test(source),c=trustCoords?coordsFrom(obj):{lat:null,lon:null},key=String(ref??`label:${norm(label)}`),old=found.get(key)||{};
    const city=pick(obj,['city','cityName'],old.city??null),state=pick(obj,['state','region'],old.state??null),country=pick(obj,['country','countryName'],old.country??null);
    found.set(key,{...old,ref:ref??old.ref??null,label:label||old.label||String(ref||'Property'),lat:validCoord(c.lat,c.lon)?c.lat:(validCoord(old.lat,old.lon)?old.lat:null),lon:validCoord(c.lat,c.lon)?c.lon:(validCoord(old.lat,old.lon)?old.lon:null),city,state,country,kind:pick(obj,['kind','type','buildingType'],old.kind??null),coordSource:validCoord(c.lat,c.lon)?source:(old.coordSource||null),raw:old.raw||trimRow(obj)});
  };
  // Real property sources: their name/label is allowed to define the building.
  for(const k of ['propertyAnchors','buildings','ownedBuildings','properties','buildingHoldings','landHoldings'])for(const o of arr(game?.[k]))merge(propertyRefOf(o),propertyLabelOf(o,true),o,`game:${k}`);
  // Assets menu building deeds live inside landHoldings[].buildings in current game data.
  for(const land of arr(game?.landHoldings))for(const b of arr(land?.buildings)){const c=coordsFrom(b),parent=coordsFrom(land),obj={...b,lat:validCoord(c.lat,c.lon)?c.lat:parent.lat,lon:validCoord(c.lat,c.lon)?c.lon:parent.lon};merge(propertyRefOf(b)||pick(b,['id','buildingId','ref'],null),propertyLabelOf(b,true),obj,'game:landHoldings.buildings');}
  // Rooms/listings can fill missing labels/coordinates for an existing building.
  for(const k of ['listings','rooms'])for(const o of arr(game?.[k])){const ref=propertyRefOf(o);if(ref!=null)merge(ref,propertyLabelOf(o,false)||String(ref),o,`game:${k}`);}
  // IMPORTANT: a shop's own name is never a property name. Only building-specific fields may label it.
  for(const o of [...arr(game?.shops),...arr(income?.sources?.shops)]){const ref=propertyRefOf(o);if(ref!=null)merge(ref,propertyLabelOf(o,false)||String(ref),o,'shop-building-ref');}
  for(const o of arr(income?.sources?.rentIncome)){const ref=propertyRefOf(o);if(ref!=null)merge(ref,propertyLabelOf(o,false)||String(ref),o,'rent-building-ref');}
  return [...found.values()];
}
function accountShopRows(game,income){
  const incomeRows=arr(income?.sources?.shops),stateRows=arr(game?.shops),anchors=new Map(extractAnchors(game,income).filter(a=>a.ref!=null).map(a=>[String(a.ref),a]));
  const keys=x=>{const out=[];for(const k of ['id','shopId','storeId'])if(x?.[k]!=null)out.push(`shop:${x[k]}`);
    if(x?.businessKey!=null){const key=String(x.businessKey);out.push(key.startsWith('shop:')?key:`business:${key}`);}
    if(x?.unitKey!=null)out.push(`unit:${x.unitKey}`);
    return [...new Set(out)];};
  const stateById=new Map(),byName=new Map(),incomeNameCounts=new Map();
  for(const x of stateRows){for(const id of keys(x)){const hits=stateById.get(id)||[];hits.push(x);stateById.set(id,hits);}const n=norm(x?.name||x?.shopName);if(n){const hits=byName.get(n)||[];hits.push(x);byName.set(n,hits);}}
  for(const r of incomeRows){const n=norm(r?.name||r?.shopName);incomeNameCounts.set(n,(incomeNameCounts.get(n)||0)+1);}
  const matched=new Map();
  for(const r of incomeRows){let match=null;
    for(const id of keys(r)){const hits=stateById.get(id)||[];if(hits.length===1&&!matched.has(hits[0])){match=hits[0];break;}}
    if(!match){const n=norm(r?.name||r?.shopName),hits=byName.get(n)||[];
      if(n&&incomeNameCounts.get(n)===1&&hits.length===1&&!matched.has(hits[0]))match=hits[0];}
    if(match)matched.set(match,r);
  }
  const merge=(state,incomeRow)=>{const m={...(incomeRow||{}),...(state||{})};
    for(const field of ['grossPerMin','wagePerMin','ingredientCostPerMin','restockPerMin','costPerMin','revenuePerMin','incomePerMin','perMin'])if(m[field]==null&&incomeRow?.[field]!=null)m[field]=incomeRow[field];
    const ref=propertyRefOf(m),anchor=ref!=null?anchors.get(String(ref)):null,lat=anchor?.lat,lon=anchor?.lon;
    return{...trimRow(m),buildingRef:ref??anchor?.ref??null,buildingLabel:propertyLabelOf(m,false)||anchor?.label||null,lat:validCoord(lat,lon)?Number(lat):null,lon:validCoord(lat,lon)?Number(lon):null,coordSource:validCoord(lat,lon)?'property-anchor':null,city:pick(m,['city','cityName'],anchor?.city??null),state:pick(m,['state','region'],anchor?.state??null),country:pick(m,['country','countryName'],anchor?.country??null),busyness:pick(m,['busyness','footTraffic','trafficMultiplier'],null)!=null?Number(pick(m,['busyness','footTraffic','trafficMultiplier'])):null};};
  // /game/:id.shops is the account's inventory. Income rows describe those
  // shops; an unmatched income row must not become a second owned shop.
  if(Array.isArray(game?.shops))return stateRows.slice(0,SHOP_ROW_CAP).map(x=>merge(x,matched.get(x)));
  // On a partial account response, retain the income-only fallback.
  const seen=new Set();return incomeRows.filter(r=>{const id=keys(r)[0];if(!id)return true;if(seen.has(id))return false;seen.add(id);return true;}).slice(0,SHOP_ROW_CAP).map(r=>merge(null,r));
}
function propertyRows(game,income,shops){
  const anchors=extractAnchors(game,income),listings=arr(game?.listings),rentRows=arr(income?.sources?.rentIncome),shopRows=arr(shops);
  const listingByRef=new Map(),rentByRef=new Map(),shopsByRef=new Map();
  const add=(map,key,row)=>{if(key==null||key==='')return;key=String(key);const a=map.get(key)||[];a.push(row);map.set(key,a);};
  for(const l of listings)add(listingByRef,propertyRefOf(l),l);
  for(const r of rentRows)add(rentByRef,propertyRefOf(r),r);
  for(const sh of shopRows)add(shopsByRef,propertyRefOf(sh),sh);
  const map=new Map();for(const a of anchors){const k=String(a.ref??`label:${norm(a.label)}`);map.set(k,{...a});}
  // Never synthesize a property from a shop name. If there is no building ref, keep those shops in one explicit unresolved bucket.
  const unresolved=shopRows.filter(sh=>propertyRefOf(sh)==null);
  if(unresolved.length)map.set('__unresolved_shops__',{ref:null,label:'Unresolved shop locations',lat:null,lon:null,kind:'unresolved'});
  for(const ref of new Set([...listingByRef.keys(),...rentByRef.keys(),...shopsByRef.keys()]))if(!map.has(ref))map.set(ref,{ref,label:String(ref),lat:null,lon:null,kind:'property'});
  const rows=[];
  for(const [key,a] of map){const rooms=key==='__unresolved_shops__'?[]:(listingByRef.get(key)||[]),rents=key==='__unresolved_shops__'?[]:(rentByRef.get(key)||[]),ss=key==='__unresolved_shops__'?unresolved:(shopsByRef.get(key)||[]),occupied=rooms.filter(r=>!!r.occupant).length,c=coordsFrom(a),shopNames=ss.map(sh=>pick(sh,['name','shopName','storeName','title'],'Unnamed shop')),shopNameSet=new Set(shopNames.map(norm));let label=a.label||a.name||a.ref||'Property';if(key!=='__unresolved_shops__'&&shopNameSet.has(norm(label))){const strong=pick(a.raw,['buildingLabel','buildingName','propertyLabel','propertyName','placeName','address'],null);label=strong&&!shopNameSet.has(norm(strong))?strong:(a.ref?`Building ${a.ref}`:'Property');}rows.push({ref:a.ref??null,label,lat:validCoord(c.lat,c.lon)?c.lat:null,lon:validCoord(c.lat,c.lon)?c.lon:null,coordSource:a.coordSource||null,city:a.city||a.cityName||null,state:a.state||a.region||null,country:a.country||a.countryName||null,kind:a.kind||a.type||null,rooms:rooms.length,occupied,vacant:Math.max(0,rooms.length-occupied),rentPerMin:rents.reduce((s,r)=>s+num(r?.perMin),0),avgAskPerDay:rooms.length?rooms.reduce((s,r)=>s+num(r?.rentPerDay),0)/rooms.length:0,floors:[...new Set(rooms.map(r=>r.floor).filter(x=>x!=null))].length,shopCount:ss.length,shopGross:ss.reduce((s,r)=>s+num(r.grossPerMin),0),shopNames:shopNames.slice(0,500),shops:ss.slice(0,500).map(sh=>({id:pick(sh,['id','shopId','storeId','businessKey','unitKey','ref'],null),name:pick(sh,['name','shopName','storeName','title'],'Unnamed shop'),grossPerMin:num(sh.grossPerMin),wagePerMin:num(sh.wagePerMin),ingredientCostPerMin:num(sh.ingredientCostPerMin),busyness:finite(sh.busyness)?Number(sh.busyness):null,buildingRef:propertyRefOf(sh)}))});}
  return rows.sort((a,b)=>(b.shopGross+b.rentPerMin)-(a.shopGross+a.rentPerMin)||(b.shopCount+b.rooms)-(a.shopCount+a.rooms)||text(a.label).localeCompare(text(b.label)));
}
function extractMarketOrders(raw){const c=[raw?.marketOrders,raw?.openOrders,raw?.orders,raw?.market?.orders];for(const x of c)if(Array.isArray(x))return x.slice(0,500).map(trimRow);return[];}
function normalizeMarketCatalog(raw,sharesRaw){
  const out=new Map(),add=o=>{if(!o||typeof o!=='object')return;const name=pick(o,['name','displayName','itemName','companyName','symbol','short','ticker'],null);if(!name)return;const key=o.companyId!=null?`company:${o.companyId}`:norm(name),old=out.get(key)||{};out.set(key,{...old,...trimRow(o),key,name:text(name),kind:pick(o,['kind','type','category'],o.companyId?'company':'good'),companyId:o.companyId??old.companyId??null,price:pick(o,['lastPrice','price','last','marketPrice'],old.price??null),bid:pick(o,['bestBid','bid','bidPrice'],old.bid??null),ask:pick(o,['bestAsk','ask','askPrice'],old.ask??null),volume:pick(o,['volume24h','volume','dayVolume'],old.volume??null),dayMove:pick(o,['dayMove','changePct','percentChange','dayChangePct'],old.dayMove??null),marketCap:pick(o,['marketCap','marketCapitalization'],old.marketCap??null)});};
  for(const x of arr(raw?.market))add(x);for(const x of arr(raw?.market?.items))add(x);for(const x of arr(sharesRaw?.listings))add({...x,kind:'company'});for(const x of arr(sharesRaw?.companies))add({...x,kind:'company'});return [...out.values()];
}

function normalizeLogistics(data,shops,summaryFallback=null){
  if(!data&&(!summaryFallback||typeof summaryFallback!=='object'))return null;
  const summary=data?.summary||summaryFallback||{},byUnit=new Map();
  for(const shop of shops){if(shop?.unitKey==null||shop?.id==null)continue;
    const key=String(shop.unitKey),matches=byUnit.get(key)||[];matches.push(String(shop.id));byUnit.set(key,matches);
  }
  const requests=arr(data?.requests).slice(0,1500).map(r=>{
    const matches=byUnit.get(String(r?.toUnitKey??''))||[];
    return{shopId:matches.length===1?matches[0]:null,toUnitKey:r?.toUnitKey??null,toRef:r?.toRef??null,toLabel:r?.toLabel??null,itemId:r?.itemId??null,want:r?.want??null,onHand:r?.onHand??null,ratePerMin:r?.ratePerMin??null,reason:r?.reason??null};
  });
  return{summary:{lanes:summary.lanes??null,coverage:summary.coverage??null,vehiclesOwned:summary.vehiclesOwned??null,vehiclesNeeded:summary.vehiclesNeeded??null,unsupplied:summary.unsupplied??null,outOfStock:summary.outOfStock??null,requestedPerMin:summary.requestedPerMin??null,effectivePerMin:summary.effectivePerMin??null},requests,source:data?'game-logistics':'game-account-network'};
}

function normalizeAccount(raw,income,hist,sharesRaw,kind,name,id,logisticsRaw=null,hourlyHist=null){
  const inc=summarizeIncome(income||raw?.income||{}),shops=accountShopRows(raw||{},income||{});inc.sources.shops={count:shops.length,perMin:shops.reduce((s,r)=>s+num(r.grossPerMin),0),rows:shops};
  const bankAccounts=arr(raw?.bank?.accounts).map(a=>({id:a?.id??null,kind:a?.kind??null,name:a?.name??'Account',balance:num(a?.balance),rate:num(a?.rate),isPrimary:!!a?.isPrimary,transactions:arr(a?.transactions).slice(-80).map(trimRow)}));
  const properties=propertyRows(raw||{},income||{},shops),assetInventory=raw?.__crccAssetInventory||extractOfficialAssetInventory(raw||{}),assetRows=extractAssetRows(raw||{}),netWorthGroups=classifyNetWorth(assetRows,properties,raw?.netWorth,assetInventory),workers=arr(raw?.workers),vehicles=arr(raw?.vehicles),marketCatalog=normalizeMarketCatalog(raw||{},sharesRaw||{}),history=summarizeHistory(hist,hourlyHist),cashflow=Object.fromEntries(['24h','7d','30d'].map(range=>[range,cashflowForRange(history,range)]));
  return{id,kind,name,cash:num(raw?.cash),netWorth:num(raw?.netWorth),day:finite(raw?.day)?Number(raw.day):null,city:raw?.city?.name||raw?.cityName||null,realm:raw?.realm||null,income:inc,history,cashflow,bank:{total:bankAccounts.reduce((s,a)=>s+a.balance,0),accounts:bankAccounts},assetInventory,netWorthBreakdown:assetRows,netWorthGroups,properties,logistics:normalizeLogistics(logisticsRaw,shops,raw?.network),workers:workers.slice(0,5000).map(trimRow),vehicles:vehicles.slice(0,2000).map(trimRow),market:{orders:extractMarketOrders(raw),catalog:marketCatalog,shares:sharesRaw?trimValue(sharesRaw,0):null},counts:{shops:shops.length,properties:properties.filter(p=>p.ref||p.kind!=='unresolved').length,listings:arr(raw?.listings).length,workers:workers.length,vehicles:vehicles.length,land:assetInventory.land.length,buildings:assetInventory.buildings.length,rooms:assetInventory.rooms.length},worldWarnings:arr(raw?.worldWarnings).slice(0,120).map(trimRow)};
}
function preservePartialAccount(current,previous,raw){
  if(!previous||String(previous.id)!==String(current.id))return current;
  const omitted=key=>!Object.prototype.hasOwnProperty.call(raw,key)||
    (arr(raw.sectionsUnchanged).includes(key)&&Array.isArray(raw[key])&&!raw[key].length);
  if(omitted('shops')){
    current.income.sources.shops=previous.income?.sources?.shops||current.income.sources.shops;
    current.counts.shops=current.income.sources.shops.count;
  }
  // Asset categories can be returned independently. A missing asset section
  // must not erase deeds just because landHoldings was included in this feed.
  const old=previous.assetInventory||{};
  if(omitted('assets')&&omitted('ownedBuildings')&&omitted('ownedRooms')){
    current.assetInventory.buildings=old.buildings||[];
    current.assetInventory.rooms=old.rooms||[];
  }
  if(omitted('assets')&&omitted('landHoldings'))current.assetInventory.land=old.land||[];
  for(const category of ['land','buildings','rooms'])current.counts[category]=current.assetInventory[category]?.length||0;
  if(omitted('assets')){current.netWorthBreakdown=previous.netWorthBreakdown||current.netWorthBreakdown;current.netWorthGroups=previous.netWorthGroups||current.netWorthGroups;}
  if(omitted('propertyAnchors')){
    const found=new Map(current.properties.filter(p=>p.ref).map(p=>[String(p.ref),p]));
    for(const p of previous.properties||[])if(p.ref){const existing=found.get(String(p.ref));if(!existing){current.properties.push(p);found.set(String(p.ref),p);}else for(const key of ['lat','lon','coordSource','city','state','country'])if(existing[key]==null)existing[key]=p[key]??null;}
  }
  if(omitted('shops')&&omitted('propertyAnchors')&&omitted('listings')&&omitted('leases'))current.properties=previous.properties||current.properties;
  current.counts.properties=current.properties.filter(p=>p.ref||p.kind!=='unresolved').length;
  if(omitted('workers'))current.workers=previous.workers||[];
  if(omitted('vehicles'))current.vehicles=previous.vehicles||[];
  return current;
}
async function loadAccount(id,kind,name,errors,observedCache=null,previous=null){
  const base=`/game/${encodeURIComponent(id)}`;const safe=async(label,path)=>{try{return await gameGet(path);}catch(e){errors.push(`${kind} ${label}: ${e.message}`);return null;}};
  const[raw,income,hist,sharesRaw,logisticsRaw,hourlyHist]=await Promise.all([safe('account',base),safe('income',base+'/income/detail'),safe('history',base+'/income/history?days=30&bucket=day'),safe('shares',base+'/shares/listings'),gameGet(base+'/logistics').catch(()=>null),gameGet(base+'/income/history?days=2&bucket=hour').catch(()=>null)]);if(!raw)return null;
  if(observedCache){const observedInv=extractObservedAssetInventory(observedCache,id),baseInv=extractOfficialAssetInventory(raw);raw.__crccAssetInventory=mergeAssetInventories(observedInv,baseInv);}
  return preservePartialAccount(normalizeAccount(raw,income,hist,sharesRaw,kind,name,id,logisticsRaw,hourlyHist),previous,raw);
}
function lbEntry(x){return x?{rank:finite(x.rank)?Number(x.rank):null,playerId:x.playerId??null,name:x.name??'—',founderNumber:finite(x.founderNumber)?Number(x.founderNumber):null,value:num(x.value),wealthClass:x.wealthClass??null}:null;}
function companyAnalytics(summary,equity,members){
  const ms=arr(members),shares=ms.map(m=>({playerId:m.playerId??m.id??null,name:m.name??m.playerName??'Member',isFounder:!!m.isFounder,revenueBps:finite(m.revenueBps)?Number(m.revenueBps):null,revenueBalance:num(m.revenueBalance),perms:finite(m.perms)?Number(m.perms):null,pendingBps:finite(m.pendingBps)?Number(m.pendingBps):null,pendingAt:m.pendingAt??null}));
  const allocatedBps=shares.reduce((s,m)=>s+(finite(m.revenueBps)?Number(m.revenueBps):0),0),retainedBps=Math.max(0,10000-allocatedBps),bookValue=num(pick(equity,['bookValue','value'],pick(summary,['bookValue','value'],0)));
  const publicThreshold=finite(equity?.minBookValue)?Number(equity.minBookValue):null;
  return{bookValue,publicThreshold,publicProgress:publicThreshold>0?Math.min(1,bookValue/publicThreshold):null,retainedBps,allocatedBps,members:shares,permissionBits:[{bit:1,label:'Operate'},{bit:2,label:'Trade'},{bit:4,label:'Property'},{bit:8,label:'Hire'},{bit:16,label:'Finance'},{bit:32,label:'Manage'}]};
}
function equityStatus(profile){
  const status=profile?.equity?.status??profile?.summary?.status;
  if(status==='listed')return 'listed';
  if(status==='private'||status==='unlisted')return 'not listed';
  const flag=profile?.equity?.isPublic??profile?.equity?.public??profile?.summary?.isPublic??profile?.summary?.public;
  return typeof flag==='boolean'?(flag?'listed':'not listed'):'unknown';
}

async function recordHistory(snapshot){
  const s=await chrome.storage.local.get([HISTORY_KEY,HOURLY_KEY]),history=arr(s[HISTORY_KEY]),hourly=arr(s[HOURLY_KEY]),last=history.at(-1);
  const make=a=>a?{cash:a.cash,netWorth:a.netWorth,netPerMin:a.income?.rates?.netPerMin||0,grossPerMin:a.income?.rates?.grossPerMin||0,shopGross:a.income?.sources?.shops?.perMin||0,shops:a.income?.sources?.shops?.count||0,rentPerMin:a.income?.rates?.rentIncomePerMin||0}:null;
  const rec={t:snapshot.fetchedAt,character:snapshot.diagnostics?.personalOperationalFeed==='working'?make(snapshot.accounts.character):null,company:snapshot.identity?.companyId&&snapshot.diagnostics?.companyOperationalFeed==='working'?make(snapshot.accounts.company):null};
  if(!last||rec.t-last.t>=240000){history.push(rec);while(history.length>HISTORY_CAP)history.shift();}
  const bucket=Math.floor(rec.t/3600000)*3600000;if(!hourly.length||hourly.at(-1).t!==bucket){hourly.push({...rec,t:bucket});while(hourly.length>HOURLY_CAP)hourly.shift();}else hourly[hourly.length-1]={...rec,t:bucket};
  await chrome.storage.local.set({[HISTORY_KEY]:history,[HOURLY_KEY]:hourly});
}
async function refreshData(){
  const errors=[],storedPrior=await chrome.storage.local.get([KEY,LAST_COMPANY_KEY]),prior=storedPrior[KEY]||null,lastCompany=storedPrior[LAST_COMPANY_KEY]||null;
  let me;try{me=await gameGet('/me');}catch(e){if(prior){const cached={...prior,errors:[`account identity: ${e.message}`],diagnostics:{...(prior.diagnostics||{}),identity:'failed',operationalFeed:'cached'}};await chrome.storage.local.set({[KEY]:cached});return cached;}throw e;}
  const personalId=me?.playerId??prior?.identity?.personalId;if(!personalId)throw new Error('Capital Rift did not report a signed-in player. Open the game and sign in.');
  const samePlayer=String(prior?.identity?.personalId)===String(personalId),trustedLast=lastCompany&&(lastCompany.ownerPersonalId==null?samePlayer:String(lastCompany.ownerPersonalId)===String(personalId))?lastCompany:null;
  const active=activeAccountFromMe(me,samePlayer?(prior?.identity?.companyId||prior?.accounts?.company?.id):null),companyId=active.scope==='company'&&!active.uncertain?active.id:null,companyName=(companyId&&me?.piloting?.name)||(samePlayer&&String(prior?.accounts?.company?.id)===String(companyId)?prior?.identity?.companyName:null),safe=async(label,path)=>{try{return await gameGet(path);}catch(e){errors.push(`${label}: ${e.message}`);return null;}};
  const observedStore=await chrome.storage.local.get(ASSET_OBS_KEY),observedCache=observedStore[ASSET_OBS_KEY]||{};
  const[personalFeed,companyFeed,mine,leaderboard,access,ticker,stored]=await Promise.all([loadAccount(personalId,'character',me?.playerName||me?.name||'Character',errors,observedCache,samePlayer?prior?.accounts?.character:null),companyId?loadAccount(companyId,'company',companyName||'Current company',errors,observedCache,(samePlayer&&prior?.accounts?.company?.id===companyId?prior.accounts.company:trustedLast?.id===companyId?trustedLast.account:null)):Promise.resolve(null),safe('companies','/company/mine'),safe('leaderboard','/social/leaderboard'),safe('world','/access/status'),safe('market ticker','/market/ticker'),chrome.storage.local.get([MARKET_KEY,KEY,PROPERTY_BUYERS_KEY])]);
  const personal=personalFeed||(samePlayer&&String(prior?.accounts?.character?.id)===String(personalId)?prior.accounts.character:null);
  const availableCompanies=arr(mine?.companies).length?arr(mine.companies).map(c=>({id:c.id??c.companyId,name:c.name??null})).filter(c=>c.id):samePlayer?arr(prior?.identity?.availableCompanies):[];
  const availableId=companyId||availableCompanies.find(c=>samePlayer&&String(c.id)===String(prior?.accounts?.company?.id))?.id||availableCompanies.find(c=>String(c.id)===String(trustedLast?.id))?.id||null;
  const cachedCompany=samePlayer&&prior?.accounts?.company?.id===availableId?prior.accounts.company:trustedLast?.id===availableId?trustedLast.account:null;
  const company=companyFeed||cachedCompany;
  const resolvedCompanyName=companyName||availableCompanies.find(c=>String(c.id)===String(availableId))?.name||company?.name||null;
  if(companyFeed&&resolvedCompanyName)companyFeed.name=resolvedCompanyName;
  let companyProfile=null;if(availableId){const reported=arr(mine?.companies).find(c=>String(c?.id)===String(availableId))||null,[equityResponse,membersRaw]=await Promise.all([safe('company equity',`/company/${encodeURIComponent(availableId)}/equity`),safe('company members',`/company/${encodeURIComponent(availableId)}/members`)]),older=samePlayer&&String(prior?.accounts?.company?.id)===String(availableId)?prior.companyProfile:String(trustedLast?.id)===String(availableId)?trustedLast.profile:null,summary=reported||older?.summary||null,equity=equityResponse||older?.equity||null,members=membersRaw?arr(membersRaw.members):arr(older?.members);companyProfile=summary||equity||membersRaw||older?{summary:summary?trimRow(summary):null,equity:equity?trimRow(equity):null,members:members.map(trimRow),analytics:companyAnalytics(summary,equity,members)}:null;}
  const leaderboardNorm=leaderboard?{updatedAt:num(leaderboard.updatedAt),total:num(leaderboard?.netWorth?.total),you:lbEntry(leaderboard?.netWorth?.you),entries:arr(leaderboard?.netWorth?.entries).slice(0,250).map(lbEntry),wealthClass:leaderboard?.netWorthClass?.wealthClass??null,globalRank:finite(leaderboard?.netWorthClass?.globalRank)?Number(leaderboard.netWorthClass.globalRank):null,population:num(leaderboard?.netWorthClass?.population)}:null;
  const tickerRows=arr(ticker?.items).map(it=>({key:norm(it?.label||it?.id),id:it?.id??null,commodityId:it?.id??null,name:text(it?.label||it?.id),label:text(it?.label||it?.id),kind:it?.kind||'good',price:finite(it?.price)?Number(it.price):null,dayMove:finite(it?.dayPct)?Number(it.dayPct):null,dayPct:finite(it?.dayPct)?Number(it.dayPct):null,flat:!!it?.flat,source:'Capital Rift market ticker'}));
  if(tickerRows.length)await mergeMarketIntel(tickerRows);
  const world=access?{playersOnline:num(access?.playersOnline),maxPlayers:num(access?.maxPlayers),serverNow:access?.serverNow??null,worldNetWorth:num(access?.world?.netWorth),gdp24h:num(access?.world?.gdp24h),quotes:[...arr(access?.world?.quotes).slice(0,100).map(trimRow),...tickerRows.slice(0,500)]}:({quotes:tickerRows});
  const snapshot={schema:6,fetchedAt:Date.now(),autoRefreshMinutes:5,identity:{personalId,playerName:personal?.name||me?.playerName||null,companyId,companyName:resolvedCompanyName,availableCompanies,pilotedCompanyId:companyId,me:trimRow(me)},accounts:{character:personal,company},companyProfile,leaderboard:leaderboardNorm||(samePlayer?prior?.leaderboard:null)||null,world,marketTicker:{at:ticker?.at??null,dayStartMs:ticker?.dayStartMs??null,count:tickerRows.length},observedMarket:stored[MARKET_KEY]||{},errors,diagnostics:{identity:active.uncertain?'partial':'working',activeScope:active.scope,accountId:companyId||personalId,companyProfile:companyProfile?errors.some(e=>/company (equity|members)|companies:/.test(e))?'partial':'available':'unavailable',operationalFeed:active.scope==='company'?(companyFeed?'working':company?'cached':'failed'):(personalFeed?'working':personal?'cached':'failed'),personalOperationalFeed:personalFeed?'working':personal?'cached':'failed',companyOperationalFeed:companyFeed?'working':company?'cached':'unavailable',availableCompanies:availableCompanies.length,pilotedCompanyId:companyId||null,publicCompany:equityStatus(companyProfile)}};
  if(companyFeed&&companyId&&String(companyFeed.id)===String(companyId)){
    transactionLogWrites=transactionLogWrites.catch(()=>{}).then(()=>appendCompanyTransactions(personalId,companyId,companyFeed,snapshot.fetchedAt));
    await transactionLogWrites.catch(()=>{}); // A malformed bank row must not interrupt account refresh.
  }
  await updatePropertyBuyers(snapshot,stored[KEY]||null);
  const previousScout=await chrome.storage.local.get(SCOUT_ACCOUNT_KEY);
  const scoutAccounts={...(previousScout[SCOUT_ACCOUNT_KEY]||{})};
  // Keep the verified company's anchors when the player unpilots.
  for(const [scope,currentId] of [['character',personalId],['company',availableId]])if(scoutAccounts[scope]?.id&&scoutAccounts[scope].id!==currentId)delete scoutAccounts[scope];
  for(const [scope,account] of Object.entries(snapshot.accounts)){
    if(!account?.id||!Array.isArray(account.properties))continue; // A failed/partial refresh must not erase valid anchors.
    if(!account.properties.length&&errors.length&&scoutAccounts[scope]?.id===account.id&&scoutAccounts[scope]?.rows?.length)continue;
    scoutAccounts[scope]={id:account.id,rows:account.properties.filter(p=>p?.ref).map(p=>scoutAnchor(p))};
  }
  scoutDataRevision++;await chrome.storage.local.set({[KEY]:snapshot,[SCOUT_ACCOUNT_KEY]:scoutAccounts,...(company?{[LAST_COMPANY_KEY]:{ownerPersonalId:personalId,id:company.id,account:company,profile:companyProfile}}:samePlayer&&prior?.accounts?.company?{[LAST_COMPANY_KEY]:{ownerPersonalId:personalId,id:prior.accounts.company.id,account:prior.accounts.company,profile:prior.companyProfile}}:{})});await recordHistory(snapshot);
  const old=await chrome.storage.local.get(PLAYER_TRACK_KEY),track=old[PLAYER_TRACK_KEY]&&typeof old[PLAYER_TRACK_KEY]==='object'?old[PLAYER_TRACK_KEY]:{};if(leaderboardNorm?.entries)for(const p of leaderboardNorm.entries){if(!p.playerId)continue;const prev=track[p.playerId]?.latest||null;track[p.playerId]={name:p.name,latest:{t:Date.now(),rank:p.rank,value:p.value,founderNumber:p.founderNumber},previous:prev};}await chrome.storage.local.set({[PLAYER_TRACK_KEY]:track});return snapshot;
}
async function appendCompanyTransactions(personalId,companyId,account,at){
  const entries=CRCCTransactions.fromAccount(account);if(!entries.length)return;
  const s=await chrome.storage.local.get(TRANSACTION_LOG_KEY),all=s[TRANSACTION_LOG_KEY]||{},key=String(personalId)+':'+String(companyId),old=all[key]||{};
  all[key]={ownerPersonalId:String(personalId),companyId:String(companyId),rows:CRCCTransactions.merge(old.rows,entries),observedAt:at,bankCount:(account.bank?.accounts||[]).length};
  const keys=Object.keys(all).sort((a,b)=>(all[b]?.observedAt||0)-(all[a]?.observedAt||0));for(const stale of keys.slice(8))delete all[stale];
  await chrome.storage.local.set({[TRANSACTION_LOG_KEY]:all});
}
async function getCompanyTransactions(personalId,companyId){
  const s=await chrome.storage.local.get([KEY,TRANSACTION_LOG_KEY]),snap=s[KEY],owner=String(snap?.identity?.personalId||''),company=String(snap?.accounts?.company?.id||'');
  if(!owner||owner!==String(personalId)||!company||company!==String(companyId))throw Error('Select the company associated with this signed-in player.');
  return s[TRANSACTION_LOG_KEY]?.[owner+':'+company]||{ownerPersonalId:owner,companyId:company,rows:[],observedAt:null};
}

// ---- public location helpers ----
let geoChain=Promise.resolve(0);async function paceGeo(){geoChain=geoChain.then(async last=>{const wait=Math.max(0,700-(Date.now()-last));if(wait)await sleep(wait);return Date.now();});return geoChain;}function geoKey(lat,lon){return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;}
async function reverseGeocode(lat,lon){if(!finite(lat)||!finite(lon))throw new Error('No location coordinates are available.');const key=geoKey(lat,lon),stored=await chrome.storage.local.get(GEO_KEY),cache=stored[GEO_KEY]||{};if(cache[key]&&cache[key].city&&cache[key].country)return cache[key];await paceGeo();const u=new URL('https://nominatim.openstreetmap.org/reverse');u.searchParams.set('format','jsonv2');u.searchParams.set('lat',lat);u.searchParams.set('lon',lon);u.searchParams.set('zoom','14');u.searchParams.set('addressdetails','1');const data=await jsonFetch(u.href,{headers:{'Accept-Language':'en-US,en;q=0.9'}}),a=data.address||{},loc={city:a.city||a.town||a.village||a.municipality||a.county||null,state:a.state||a.region||null,country:a.country||null,countryCode:a.country_code?String(a.country_code).toUpperCase():null,displayName:data.display_name||null,road:a.road||a.pedestrian||a.neighbourhood||null,postcode:a.postcode||null};cache[key]=loc;const keys=Object.keys(cache);if(keys.length>1400)for(const k of keys.slice(0,keys.length-1200))delete cache[k];await chrome.storage.local.set({[GEO_KEY]:cache});return loc;}
async function geocodeSearch(q,limit=7){q=text(q).trim();if(q.length<2)return[];await paceGeo();const u=new URL('https://nominatim.openstreetmap.org/search');u.searchParams.set('format','jsonv2');u.searchParams.set('q',q);u.searchParams.set('limit',String(Math.min(10,Math.max(1,limit))));u.searchParams.set('addressdetails','1');const rows=await jsonFetch(u.href,{headers:{'Accept-Language':'en-US,en;q=0.9'}});return arr(rows).map(r=>({displayName:r.display_name,lat:Number(r.lat),lon:Number(r.lon),type:r.type,class:r.class,address:r.address||{}}));}
function osmRefParts(ref){const m=String(ref||'').trim().match(/^(way|relation|node)\/(\d+)$/i);if(!m)return null;return{type:m[1].toLowerCase(),id:m[2],osmId:(m[1][0].toUpperCase()+m[2])};}
async function resolveOsmRef(ref){
  const parts=osmRefParts(ref);if(!parts)throw new Error('Property reference is not an OpenStreetMap way/relation/node.');
  const stored=await chrome.storage.local.get(OSM_REF_KEY),cache=stored[OSM_REF_KEY]||{};
  if(cache[ref]&&cache[ref].city&&cache[ref].country)return cache[ref];
  await paceGeo();const u=new URL('https://nominatim.openstreetmap.org/lookup');
  u.searchParams.set('format','jsonv2');u.searchParams.set('osm_ids',parts.osmId);u.searchParams.set('addressdetails','1');u.searchParams.set('extratags','1');u.searchParams.set('namedetails','1');
  const rows=await jsonFetch(u.href,{headers:{'Accept-Language':'en-US,en;q=0.9'}}),r=arr(rows)[0];
  if(!r)throw new Error('OpenStreetMap could not resolve this property reference.');
  const a=r.address||{},loc={ref,displayName:r.display_name||null,label:r.namedetails?.name||r.name||a.building||a.amenity||a.tourism||a.office||a.shop||[a.house_number,a.road].filter(Boolean).join(' ')||ref,lat:Number(r.lat),lon:Number(r.lon),city:a.city||a.town||a.village||a.municipality||a.county||null,state:a.state||a.region||null,country:a.country||null,countryCode:a.country_code?String(a.country_code).toUpperCase():null,postcode:a.postcode||null,road:a.road||a.pedestrian||null,osmType:r.osm_type||parts.type,osmId:r.osm_id||parts.id,category:r.category||null,type:r.type||null};
  if(!validCoord(loc.lat,loc.lon))throw new Error('Resolved property did not contain a valid map center.');
  if(!loc.city||!loc.country){try{const place=await reverseGeocode(loc.lat,loc.lon);for(const k of ['city','state','country','countryCode','postcode','road'])if(!loc[k]&&place?.[k])loc[k]=place[k];}catch(_){/* keep the valid map lookup */}}
  cache[ref]=loc;const keys=Object.keys(cache);for(const k of keys.slice(1200))delete cache[k];scoutDataRevision++;await chrome.storage.local.set({[OSM_REF_KEY]:cache});return loc;
}
async function overpassJson(query){const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.nchc.org.tw/api/interpreter'];let last=null;for(const endpoint of endpoints){try{return await jsonFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(query)});}catch(e){last=e;}}throw last||new Error('All map building services failed.');}
function osmLabel(tags,id){return tags?.name||tags?.['addr:housename']||[tags?.['addr:housenumber'],tags?.['addr:street']].filter(Boolean).join(' ')||tags?.building||`Building ${id}`;}
function polygonAreaM2(geom){if(!Array.isArray(geom)||geom.length<3)return null;const R=6371000,lat0=geom.reduce((s,p)=>s+num(p.lat),0)/geom.length*Math.PI/180;let area=0;for(let i=0;i<geom.length;i++){const a=geom[i],b=geom[(i+1)%geom.length],x1=R*num(a.lon)*Math.PI/180*Math.cos(lat0),y1=R*num(a.lat)*Math.PI/180,x2=R*num(b.lon)*Math.PI/180*Math.cos(lat0),y2=R*num(b.lat)*Math.PI/180;area+=x1*y2-x2*y1;}return Math.abs(area/2);}
function distanceM(a,b){const R=6371000,p1=num(a.lat)*Math.PI/180,p2=num(b.lat)*Math.PI/180,dp=(num(b.lat)-num(a.lat))*Math.PI/180,dl=(num(b.lon)-num(a.lon))*Math.PI/180,h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function scoutRoomSummary(building){
  const sizes=[],vacantRoomSizes=[];let roomCount=0,retailUnitCount=0,vacantRooms=0,sum=0,min=Infinity,max=-Infinity;
  for(const u of Object.values(building?.units||{})){if(u.kind==='unit'){retailUnitCount++;continue;}if(u.kind!=='room')continue;roomCount++;
    if(u.status==='vacant')vacantRooms++;if(!finite(u.areaM2))continue;const size=Number(u.areaM2);sizes.push(size);sum+=size;min=Math.min(min,size);max=Math.max(max,size);if(u.status==='vacant')vacantRoomSizes.push(size);
  }
  return{roomCount,retailUnitCount,vacantRooms,roomSizes:sizes,vacantRoomSizes,roomAreaMin:sizes.length?min:null,roomAreaMax:sizes.length?max:null,roomAreaAvg:sizes.length?sum/sizes.length:null,unitObservedAt:building?.observedAt||null};
}
// Store just the fields the scout presents or filters; never retain a raw building/roster.
function scoutAnchor(x){const row={ref:String(x.ref),label:x.label||String(x.ref)};
  for(const key of ['lat','lon','chunkId','footprintBounds','listing','city','state','country','area','footTraffic','price','floors','usableFloors','archetype','subtype','kind','at','observedAt','roomCount','retailUnitCount','vacantRooms','roomSizes','vacantRoomSizes','roomAreaMin','roomAreaMax','roomAreaAvg','unitObservedAt','vacantRooms','hasOpenShop','hasOpenBusiness'])if(x[key]!=null)row[key]=x[key];
  if('owner' in x)row.owner=x.owner;if('landlord' in x)row.landlord=x.landlord;if('listing' in x)row.listing=x.listing;
  return row;
}
function scoutUnitAnchor(u){return scoutAnchor({ref:u.ref,label:u.label,area:u.areaM2,footTraffic:u.busyness,price:u.value,floors:u.floors,usableFloors:u.usableFloors,archetype:u.archetype,subtype:u.subtype,...('owner' in u?{owner:u.owner}:{}),...('landlord' in u?{landlord:u.landlord}:{}),at:u.observedAt,hasOpenShop:u.hasOpenShop,hasOpenBusiness:u.hasOpenBusiness,...scoutRoomSummary(u)});}
function scoutUnitRecord(u){const units=[];for(const item of Object.values(u.units||{}))if((item.kind==='room'||item.kind==='unit')&&item.key)units.push({key:item.key,kind:item.kind,label:item.label??null,areaM2:item.areaM2??null,rentPerDay:item.rentPerDay??null,status:item.status??null,busyWith:item.busyWith??null,floor:item.floor??null,fairRentPerDay:item.fairRentPerDay??null,tenantId:item.tenantId??null,tenantName:item.tenantName??null});
  return{ref:u.ref,label:u.label??null,areaM2:u.areaM2??null,busyness:u.busyness??null,value:u.value??null,owner:u.owner,landlord:u.landlord,floors:u.floors??null,hasOpenShop:u.hasOpenShop??null,hasOpenBusiness:u.hasOpenBusiness??null,observedAt:u.observedAt,units};
}
function scoutPass(x,f={},stats=null){const reject=key=>{if(stats)stats[key]++;return false;};
  if(!x?.ref)return reject('rejectedType');
  if(num(f.minArea)>0&&(!finite(x.area)||Number(x.area)<num(f.minArea)))return reject('rejectedArea');
  if(num(f.maxArea)>0&&(!finite(x.area)||Number(x.area)>num(f.maxArea)))return reject('rejectedArea');
  if(num(f.minTraffic)>0&&(!finite(x.footTraffic)||Number(x.footTraffic)<num(f.minTraffic)))return reject('rejectedTraffic');
  if(f.ownership&&f.ownership!=='any'){
    const owner=x.owner,party=owner&&typeof owner==='object'?owner:x.landlord,role=owner&&typeof owner==='object'?'Owner':'Landlord';
    const kind=party?.kind==='npc'?'npc':party?.kind==='player'||party?.playerId?'player':'unknown';
    if(kind+role!==f.ownership)return reject('rejectedOwnership');
  }
  if(num(f.minRooms)||num(f.maxRooms)||num(f.minRoomArea)||num(f.maxRoomArea)||f.vacantOnly){
    const sizes=f.vacantOnly?x.vacantRoomSizes:x.roomSizes;if(!Array.isArray(sizes))return reject('rejectedRooms');
    let count=0;for(const size of sizes)if(finite(size)&&Number(size)>=num(f.minRoomArea)&&(!num(f.maxRoomArea)||Number(size)<=num(f.maxRoomArea)))count++;
    if(count<Math.max(1,num(f.minRooms))||num(f.maxRooms)>0&&count>num(f.maxRooms))return reject('rejectedRooms');
  }
  return true;
}
const scoutMapCache=new Map(),scoutResultCache=new Map(),SCOUT_MAP_TTL=10*60*1000;
function scoutTileBounds(id){const parts=String(id).split('/').map(Number);if(parts.length!==3||parts.some(x=>!Number.isInteger(x))||parts[0]<0||parts[0]>22)return null;
  const[z,x,y]=parts,k=2**z;if(x<0||x>=k||y<0||y>=k)return null;
  const lat=t=>Math.atan(Math.sinh(Math.PI*(1-2*t/k)))*180/Math.PI;
  return{north:lat(y),south:lat(y+1),west:x/k*360-180,east:(x+1)/k*360-180};
}
function scoutCollection(value){return Array.isArray(value)?value:value&&typeof value==='object'?Object.values(value):[];}
function scoutBoundsIntersect(a,b){return a.north>=b.south&&a.south<=b.north&&(b.west<=b.east?a.east>=b.west&&a.west<=b.east:a.east>=b.west||a.west<=b.east);}
function scoutChunkRows(data,at){const rows={};for(const part of arr(data?.parts))for(const[id,chunk]of Object.entries(part?.chunks||{})){
    if(!scoutTileBounds(id)||!chunk||typeof chunk!=='object')continue;
    const refs=[];for(const name of ['buildings','properties'])for(const o of scoutCollection(chunk[name]))if(o?.ref||o?.buildingRef)refs.push(String(o.ref||o.buildingRef));
    rows[id]={id,at,buildingRefs:[...new Set(refs)],buildingsReported:chunk.buildings!=null||chunk.properties!=null,parcelCount:arr(chunk.parcels).length,parcelsReported:Array.isArray(chunk.parcels)};
  }return rows;
}
function mergeScoutChunkBuildings(index,data,at){let changed=false;for(const part of arr(data?.parts))for(const[id,chunk]of Object.entries(part?.chunks||{})){
    if(!scoutTileBounds(id))continue;for(const collection of ['buildings','properties'])for(const item of scoutCollection(chunk?.[collection])){
      const info=extractBuildingIntel(item,at)[0];if(!info?.ref||num(index[info.ref]?.at)>at)continue;
      index[info.ref]={...index[info.ref],...Object.fromEntries(Object.entries(scoutAnchor(info)).filter(([k,v])=>v!=null||k==='owner'||k==='landlord'||k==='listing')),chunkId:id};changed=true;
    }
  }return changed;
}
async function storeScoutMapTile(data,at,retrieval=null){
  const id=data?.chunkId;if(!scoutTileBounds(id)||!Array.isArray(data.buildings)||data.buildings.length>3000)return;
  const s=await chrome.storage.local.get([SCOUT_INDEX_KEY,SCOUT_CHUNK_KEY]);
  const index={...(s[SCOUT_INDEX_KEY]||{})},chunks={...(s[SCOUT_CHUNK_KEY]||{})},previous=chunks[id]||{},refs=new Set(previous.buildingRefs||[]);
  if(data.geometryFetchedAt&&previous.geometryFetchedAt===data.geometryFetchedAt&&previous.gameBuildingCount===data.buildings.length&&data.buildings.every(row=>validCoord(index[row.ref]?.lat,index[row.ref]?.lon)&&index[row.ref]?.footprintBounds))return;
  if(data.gameChunk)for(const ref of refs)if(ref.startsWith(`tile/${id}/`)){refs.delete(ref);delete index[ref];}
  let changed=false;
  for(const row of data.buildings){
    if(!row||typeof row.ref!=='string'||row.ref.length>120||!validCoord(row.lat,row.lon))continue;
    if(previous.gameBuildingCount!=null&&row.ref.startsWith(`tile/${id}/`))continue;
    const ref=row.ref,old=index[ref]||{};refs.add(ref);
    // Tile footprints identify visible buildings. Preserve richer details learned
    // from building-info, especially names, prices, owners and rentable rooms.
    index[ref]={...old,ref,chunkId:old.chunkId||id,lat:old.lat??row.lat,lon:old.lon??row.lon,footprintBounds:old.footprintBounds??row.footprintBounds,label:old.label&&old.label!=='Map building'?old.label:row.label||'Map building',...(!finite(old.area)&&finite(row.areaM2)?{area:Number(row.areaM2)}:{})};
    changed=true;
  }
  chunks[id]={...previous,id,at:Math.max(num(previous.at),at),buildingRefs:[...refs],buildingsReported:true,...(data.gameChunk?{gameBuildingCount:data.buildings.length}:{}) ,...(data.geometryFetchedAt?{geometryFetchedAt:data.geometryFetchedAt}:{}) ,...(retrieval?{retrieval}:{})};
  await chrome.storage.local.set({[SCOUT_CHUNK_KEY]:chunks,...(changed?{[SCOUT_INDEX_KEY]:index}:{})});
  scoutDataRevision++;
}
// CapitalRift's /api/chunk/{z}/{x}/{y} JSON contains canonical building refs
// in base.buildings. It is separate from /api/world land parcels and the MVT
// street/label tiles. Extract only footprints, refs and observed map names.
function scoutGameChunkBuildings(data,id){
  if(data?.base?.chunkId!==id||!Array.isArray(data.base.buildings)||data.base.buildings.length>3000)return null;
  const buildings=[];
  for(const item of data.base.buildings){
    if(item?.type!=='building'||!/^(?:way|relation)\/\d+$/.test(item.ref||''))continue;
    const box=observedFootprintBounds(item.footprint);if(!box)continue;
    const label=typeof item.tags?.name==='string'&&item.tags.name.trim()?item.tags.name.trim().slice(0,160):'Map building';
    buildings.push({ref:item.ref,label,lat:(box.north+box.south)/2,lon:(box.east+box.west)/2,footprintBounds:box});
  }
  return{chunkId:id,buildings,gameChunk:true,...(!data.edits?.length&&typeof data.base.fetchedAt==='string'?{geometryFetchedAt:data.base.fetchedAt}:{})};
}
// Survey reuses observed map chunks. For room searches it may refresh only
// canonical building refs via the game's observed building-info GET endpoint.
const viewportSurveyCache=new Map();
const scoutDetailCooldown=new Map(),scoutDetailInFlight=new Map();
const scoutChunkCooldown=new Map(),scoutChunkInFlight=new Map();
function surveyChunkIds(viewport,bounds){
  if(viewport.source==='game-land-request'&&Array.isArray(viewport.chunkIds))return [...new Set(viewport.chunkIds)];
  if(viewport.source!=='game-map-bounds')return null;
  // A game-exposed geographic viewport and the verified /api/chunk/z/x/y
  // endpoint can identify the small set of building chunks under that view.
  const z=15,size=2**z,clamp=v=>Math.max(0,Math.min(size-1,v)),x=lon=>clamp(Math.floor((lon+180)/360*size)),y=lat=>clamp(Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*size));
  const top=y(bounds.north),bottom=y(bounds.south),ranges=bounds.west<=bounds.east?[[x(bounds.west),x(bounds.east)]]:[[x(bounds.west),size-1],[0,x(bounds.east)]],count=ranges.reduce((n,[lo,hi])=>n+(hi-lo+1)*(bottom-top+1),0);
  if(count>100)throw new Error('This view spans more than 100 building chunks. Zoom in before surveying.');
  const ids=[];for(const [lo,hi] of ranges)for(let yy=top;yy<=bottom;yy++)for(let xx=lo;xx<=hi;xx++)ids.push(`${z}/${xx}/${yy}`);return ids;
}
async function hydrateScoutChunks(viewport,bounds,tabId,geometryHints=false){
  // The land feed names the game's requested z/x/y chunks but usually has no
  // buildings. Fetch only missing/stale chunks in that exact game-reported area.
  const ids=surveyChunkIds(viewport,bounds)||[];
  if(ids.length>400)throw new Error('Too many game-requested chunks. Zoom in before surveying.');
  const loaded=await chrome.storage.local.get(SCOUT_CHUNK_KEY),chunks=loaded[SCOUT_CHUNK_KEY]||{},now=Date.now(),wanted=[];
  let memory=0,gameCache=0,gameCacheAvailable=false,geometry={},youngestCacheAge=null;
  for(const id of ids){const tile=scoutTileBounds(id),cached=chunks[id];if(!tile||!scoutBoundsIntersect(tile,bounds))continue;
    if(cached?.gameBuildingCount!=null&&now-num(cached.at)<10*60*1000){memory++;continue;}
    if(num(scoutChunkCooldown.get(id))>now)continue;wanted.push(id);
  }
  let missing=wanted;
  if(tabId&&(wanted.length||geometryHints)){try{
    const response=await chrome.tabs.sendMessage(tabId,{kind:'readGameCache',ids:(geometryHints?ids:wanted).slice(0,100),geometryHints});
    gameCacheAvailable=!!response?.available;geometry=response?.geometry||{};
    const found=response?.chunks||{};missing=[];
    for(const id of wanted){const entry=found[id];if(!entry){missing.push(id);continue;}
      const normalized=scoutGameChunkBuildings(entry.data,id);
      if(!normalized){missing.push(id);continue;}
      await storeScoutMapTile(normalized,now,{source:'capitalrift-idb',cacheTs:entry.cacheTs,ageMs:entry.ageMs,fresh:true});
      gameCache++;
      youngestCacheAge=youngestCacheAge==null?entry.ageMs:Math.min(youngestCacheAge,entry.ageMs);
    }
  }catch(_){} }
  const selected=missing.slice(0,6);let next=0,done=0,failed=0;
  await Promise.all(Array.from({length:Math.min(2,selected.length)},async()=>{
    while(next<selected.length){const id=selected[next++];let inflight;
      try{
        inflight=scoutChunkInFlight.get(id);
        if(!inflight){const url='/chunk/'+id;
          inflight=(async()=>{const data=await gameGet(url);if(!scoutGameChunkBuildings(data,id))throw new Error('Chunk omitted building data');
            await (observationWrites=observationWrites.catch(()=>{}).then(()=>storeObservation({kind:'response',method:'GET',url:API+url,status:200,data,ts:Date.now()})));})();
          scoutChunkInFlight.set(id,inflight);
        }
        await inflight;done++;
      }catch(_){failed++;scoutChunkCooldown.set(id,Date.now()+5000);}finally{if(scoutChunkInFlight.get(id)===inflight)scoutChunkInFlight.delete(id);}
    }
  }));
  return{requested:done,remaining:Math.max(0,missing.length-selected.length),failed,required:ids.length,memory,gameCache,networkNeeded:missing.length,gameCacheAvailable,geometry,youngestCacheAge};
}
async function inspectVisibleRoomDetails(viewport,criteria){
  const f=globalThis.CRCCScoutSurvey?.active(criteria||{});
  const needsDetails=f&&(['room','shop'].includes(f.target)||f.target==='building'&&(['roomsMin','roomsMax','buildingMin','buildingMax','valueMin','valueMax','trafficMin'].some(key=>f[key]!=null)||f.ownership!=='any'||f.availability!=='any'));
  if(!needsDetails)return{requested:0,candidates:0,remaining:0};
  const bounds=globalThis.CRCCScoutSurvey.bounds(viewport),loaded=await chrome.storage.local.get([SCOUT_INDEX_KEY,SCOUT_CHUNK_KEY]);
  const chunks=loaded[SCOUT_CHUNK_KEY]||{},ids=surveyChunkIds(viewport,bounds),requested=ids?new Set(ids):null;
  const candidates=[];
  for(const row of Object.values(loaded[SCOUT_INDEX_KEY]||{})){
    if(!/^(?:way|relation)\/\d+$/.test(row?.ref||'')||!scoutTileBounds(row.chunkId))continue;
    if(requested?!requested.has(row.chunkId):!globalThis.CRCCScoutSurvey.intersects(row,bounds)&&!scoutBoundsIntersect(scoutTileBounds(row.chunkId),bounds))continue;
    if(f.buildingMin!=null&&finite(row.area)&&Number(row.area)<f.buildingMin||f.buildingMax!=null&&finite(row.area)&&Number(row.area)>f.buildingMax)continue;
    candidates.push(row);
  }
  // Only official building references can be used with building-info. Generic
  // tile feature IDs have no verified lookup endpoint.
  const unique=[...new Map(candidates.map(row=>[row.ref,row])).values()];
  const centerLat=(bounds.north+bounds.south)/2,centerLon=(bounds.east+bounds.west)/2;
  unique.sort((a,b)=>((Number(a.lat)-centerLat)**2+(Number(a.lon)-centerLon)**2)-((Number(b.lat)-centerLat)**2+(Number(b.lon)-centerLon)**2));
  const unitKeys=unique.map(row=>SCOUT_UNIT_PREFIX+row.ref),cached=unitKeys.length?await chrome.storage.local.get(unitKeys):{};
  const now=Date.now(),eligible=unique.filter(row=>{
    const detail=cached[SCOUT_UNIT_PREFIX+row.ref];
    return !(detail?.observedAt&&now-detail.observedAt<60000)&&num(scoutDetailCooldown.get(row.ref))<=now;
  }),pending=eligible.slice(0,48);
  let next=0,done=0;
  await Promise.all(Array.from({length:Math.min(3,pending.length)},async()=>{
    while(next<pending.length){const row=pending[next++],ref=row.ref;let inflight;
      try{
        inflight=scoutDetailInFlight.get(ref);
        if(!inflight){const url=`/building-info?ref=${encodeURIComponent(ref)}&chunk=${encodeURIComponent(row.chunkId)}`;
          inflight=(async()=>{const data=await gameGet(url);await (observationWrites=observationWrites.catch(()=>{}).then(()=>storeObservation({kind:'response',method:'GET',url:API+url,status:200,data,ts:Date.now()})));})();
          scoutDetailInFlight.set(ref,inflight);
        }
        await inflight;done++;
      }catch(_){scoutDetailCooldown.set(ref,Date.now()+60000);}finally{if(scoutDetailInFlight.get(ref)===inflight)scoutDetailInFlight.delete(ref);}
    }
  }));
  return{requested:done,candidates:unique.length,remaining:Math.max(0,eligible.length-pending.length)};
}
async function surveyVisibleArea(viewport,criteria=null,tabId=null){const b=globalThis.CRCCScoutSurvey?.bounds(viewport);if(!b)throw new Error('CapitalRift has not exposed game map bounds or requested land chunks. Pan the map and try again.');
  const span=b.west<=b.east?b.east-b.west:360-b.west+b.east;if(b.north-b.south>2||span>2)throw new Error('This view is too large for a detailed game property survey. Zoom in and retry.');
  const f=globalThis.CRCCScoutSurvey.active(criteria||{}),inspectRooms=['room','shop'].includes(f.target)||f.target==='building'&&(['roomsMin','roomsMax','buildingMin','buildingMax','valueMin','valueMax','trafficMin'].some(key=>f[key]!=null)||f.ownership!=='any'||f.availability!=='any');
  const key=JSON.stringify([b.north,b.south,b.east,b.west,viewport.source,viewport.chunkIds??null,f.target,inspectRooms?[f.buildingMin,f.buildingMax,f.roomsMin,f.roomsMax]:null,!!criteria?.renderHints,scoutDataRevision]),old=viewportSurveyCache.get(key);
  if(old&&(old.pending||Date.now()-old.at<20000)){const result=await(old.pending||old.result);return{...result,viewport:{...result.viewport,cameraPoint:viewport.cameraPoint??null},stats:{...result.stats,cached:true}};}
  const pending=(async()=>{const chunks=f.target==='land'?{requested:0,remaining:0,failed:0}:await hydrateScoutChunks(viewport,b,tabId,!!criteria?.renderHints),details=inspectRooms?await inspectVisibleRoomDetails(viewport,f):{requested:0,candidates:0,remaining:0};
    const hints=new Map(Object.values(chunks.geometry||{}).flat().map(x=>[x.ref,x])),decorate=result=>({...result,entities:result.entities.map(x=>{const hint=hints.get(x.parentRef||x.ref);return hint?{...x,renderHint:hint}:x;}),stats:{...result.stats,detailsRequested:details.requested,detailCandidates:details.candidates,detailsRemaining:details.remaining,buildingChunksFetched:chunks.requested,buildingChunksRemaining:chunks.remaining,buildingChunksFailed:chunks.failed,cacheRequired:chunks.required||0,cacheMemory:chunks.memory||0,cacheGame:chunks.gameCache||0,cacheGameAgeMs:chunks.youngestCacheAge??null,cacheNetworkNeeded:chunks.networkNeeded||0,cacheAvailable:!!chunks.gameCacheAvailable,geometryCandidates:hints.size}});
    let result;for(let i=0;i<2;i++){const revision=scoutDataRevision;result=await computeVisibleArea(viewport,f);if(revision===scoutDataRevision)return decorate(result);}result.stats.partialCoverage=true;return decorate(result);})();
  viewportSurveyCache.set(key,{pending});try{const result=await pending;if(viewportSurveyCache.size>5)viewportSurveyCache.delete(viewportSurveyCache.keys().next().value);if(result.stats.buildingChunksFailed||result.stats.buildingChunksRemaining||result.stats.detailsRemaining)viewportSurveyCache.delete(key);else viewportSurveyCache.set(key,{at:Date.now(),result});return result;}catch(e){viewportSurveyCache.delete(key);throw e;}
}
async function computeVisibleArea(viewport,criteria=null){const b=globalThis.CRCCScoutSurvey?.bounds(viewport);if(!b)throw new Error('Invalid map bounds.');
  const span=b.west<=b.east?b.east-b.west:360-b.west+b.east;if(b.north-b.south>2||span>2)throw new Error('This view is too large for a detailed game property survey. Zoom in and retry.');
  const target=globalThis.CRCCScoutSurvey.active(criteria||{}).target,needBuildings=target!=='land',needUnits=target==='any'||target==='building'||target==='room'||target==='shop',needLand=target==='any'||target==='land';
  const s=await chrome.storage.local.get([SCOUT_CHUNK_KEY,...(needBuildings?[SCOUT_INDEX_KEY]:[]),...(needLand?[PARCEL_INTEL_KEY]:[])]),chunks=s[SCOUT_CHUNK_KEY]||{},loaded=[];
  const ids=surveyChunkIds(viewport,b),requested=ids?new Set(ids):null;
  if(requested){if(requested.size>400)throw new Error('Too many game-requested land chunks. Zoom in.');for(const id of requested){const row=chunks[id];if(row)loaded.push(row);}}
  else for(const [id,row]of Object.entries(chunks)){const tile=scoutTileBounds(id);if(tile&&scoutBoundsIntersect(tile,b))loaded.push(row);}
  if(loaded.length>400)throw new Error('This viewport contains too many observed chunks. Zoom in before surveying.');
  const available=new Set(loaded.map(r=>r.id)),entities=[],seen=new Set(),buildingRefs=new Set(),refChunks=new Map();
  if(needBuildings)for(const row of loaded)for(const ref of row.buildingRefs||[]){buildingRefs.add(ref);refChunks.set(ref,row.id);}
  if(needBuildings)for(const x of Object.values(s[SCOUT_INDEX_KEY]||{})){
    if(!x?.ref||seen.has('building:'+x.ref))continue;
    const inChunk=x.chunkId&&available.has(x.chunkId),point=(!requested||!x.chunkId)&&globalThis.CRCCScoutSurvey.intersects(x,b);
    if(!inChunk&&!point)continue;seen.add('building:'+x.ref);buildingRefs.add(x.ref);
    if(target==='any'||target==='building')entities.push({ref:x.ref,entityType:'building',label:x.label||x.ref,areaM2:x.area??null,roomCount:x.roomCount??null,vacantRooms:x.vacantRooms??null,floors:x.floors??null,hasOpenShop:x.hasOpenShop,hasOpenBusiness:x.hasOpenBusiness,busyness:x.footTraffic??null,value:x.price??null,listing:x.listing??null,owner:x.owner,landlord:x.landlord,lat:x.lat??null,lon:x.lon??null,footprintBounds:x.footprintBounds??null,chunkId:x.chunkId??null,source:'observed-game-building'});
  }
  // Dense game chunks can contain more than 10,000 building refs. Building
  // rows use the bounded index already loaded above; only buildings with
  // observed units need a per-building cache read in such chunks.
  const detailRefs=needUnits?[...buildingRefs].filter(ref=>s[SCOUT_INDEX_KEY]?.[ref]?.unitObservedAt||target!=='building'&&buildingRefs.size<=10000&&/^(?:way|relation)\/\d+$/.test(ref)):[];
  if(detailRefs.length>10000)throw new Error('Too many observed building units to survey safely. Zoom in.');
  const unitKeys=detailRefs.map(ref=>SCOUT_UNIT_PREFIX+ref),unitCache=unitKeys.length?await chrome.storage.local.get(unitKeys):{};
  if(unitKeys.some(key=>!unitCache[key])){const legacy=await chrome.storage.local.get(UNIT_INTEL_KEY);for(const ref of detailRefs)if(!unitCache[SCOUT_UNIT_PREFIX+ref]&&legacy[UNIT_INTEL_KEY]?.[ref]){
      unitCache[SCOUT_UNIT_PREFIX+ref]=scoutUnitRecord(legacy[UNIT_INTEL_KEY][ref]);
    }
  }
  if(needUnits)for(const ref of buildingRefs){const building=unitCache[SCOUT_UNIT_PREFIX+ref];if(!building||building.missing)continue;
    const origin=s[SCOUT_INDEX_KEY]?.[ref]||building;
    if((target==='any'||target==='building')&&!seen.has('building:'+ref)){seen.add('building:'+ref);entities.push({ref,entityType:'building',label:building.label||ref,areaM2:building.areaM2??null,roomCount:building.units.filter(u=>u.kind==='room').length,vacantRooms:building.units.filter(u=>u.kind==='room'&&u.status==='vacant').length,floors:building.floors??null,hasOpenShop:building.hasOpenShop,hasOpenBusiness:building.hasOpenBusiness,busyness:building.busyness??null,value:building.value??null,owner:building.owner,landlord:building.landlord,lat:origin.lat??null,lon:origin.lon??null,chunkId:refChunks.get(ref)??null,source:'observed-game-building'});}
    if(target==='building')continue;
    for(const u of building.units){
      if(u.kind!=='room'&&u.kind!=='unit'||target==='room'&&u.kind!=='room'||target==='shop'&&u.kind!=='unit')continue;const type=u.kind==='unit'?'shop':'room',key=String(u.key||'');if(!key||seen.has(type+':'+key))continue;seen.add(type+':'+key);
      const chunkId=origin.chunkId||refChunks.get(ref)||null,tile=!validCoord(origin.lat,origin.lon)&&chunkId?scoutTileBounds(chunkId):null;
      entities.push({ref:key,parentRef:ref,entityType:type,label:u.label||key,areaM2:u.areaM2??null,buildingAreaM2:origin.area??building.areaM2??null,buildingLabel:building.label??origin.label??null,buildingValue:building.value??null,buildingFloors:building.floors??null,floor:u.floor??null,kind:u.kind,fairRentPerDay:u.fairRentPerDay??null,tenantId:u.tenantId??null,tenantName:u.tenantName??null,busyness:origin.footTraffic??building.busyness??null,value:null,rentPerDay:u.rentPerDay??null,status:u.status??null,owner:origin.owner,landlord:origin.landlord,lat:validCoord(origin.lat,origin.lon)?origin.lat:tile?(tile.north+tile.south)/2:null,lon:validCoord(origin.lat,origin.lon)?origin.lon:tile?(tile.east+tile.west)/2:null,locationPrecision:tile?'chunk':'building',footprintBounds:origin.footprintBounds??null,chunkId,source:'observed-game-unit'});
    }
  }
  if(needLand)for(const x of Object.values(s[PARCEL_INTEL_KEY]||{})){
    if(!x?.id)continue;
    if(!available.has(x.chunkId)&&(requested&&x.chunkId||!globalThis.CRCCScoutSurvey.intersects(x,b)))continue;
    entities.push({ref:x.id,entityType:'land',label:'Land parcel '+x.id,areaM2:x.areaM2??null,busyness:x.busyness??null,value:x.value??null,purchasePrice:finite(x.listing?.price)?Number(x.listing.price):finite(x.purchasePrice)?Number(x.purchasePrice):null,listing:x.listing??null,owner:x.owner,myOwned:x.myOwned===true,observedAt:x.observedAt??null,lat:x.lat,lon:x.lon,footprintBounds:x.footprintBounds??null,chunkId:x.chunkId,source:'observed-game-land'});
  }
  return{viewport:{...b,cameraPoint:viewport.cameraPoint??null},source:viewport.source||'game-map-bounds',zoom:viewport.zoom??null,entities,stats:{chunksLoaded:loaded.length,chunksRequested:requested?.size??null,chunksWithParcels:loaded.filter(r=>r.parcelCount).length,chunksWithBuildings:loaded.filter(r=>r.buildingRefs?.length).length,partialCoverage:!!(requested&&loaded.length<requested.size)||!loaded.length||loaded.some(r=>!r.buildingsReported||!r.parcelsReported),at:Date.now()},status:entities.length?'ready':'no-game-data'};
}
async function scoutMapRows(p,radiusM,stats,centersOnly=false){
  const cacheKey=`${Number(p.lat).toFixed(5)},${Number(p.lon).toFixed(5)}:${radiusM}${centersOnly?':centers':''}`,old=scoutMapCache.get(cacheKey);
  if(old&&(old.pending||Date.now()-old.at<SCOUT_MAP_TTL)){stats.mapCacheHits++;return old.pending||old.rows;}
  stats.mapRequests++;const promise=(async()=>{
    const query=`[out:json][timeout:30];(way["building"](around:${radiusM},${p.lat},${p.lon});relation["building"](around:${radiusM},${p.lat},${p.lon}););out ${centersOnly?'center':'geom'};`;
    const data=await overpassJson(query),rows=[],seen=new Set();let processed=0;for(const e of arr(data?.elements)){
      if(++processed%350===0)await sleep(0); // Yield during unusually large map responses.
      const ref=`${e.type}/${e.id}`;if(seen.has(ref))continue;seen.add(ref);
      const geom=arr(e.geometry),t=e.tags||{};let lat=e.center?.lat??e.lat,lon=e.center?.lon??e.lon;
      if((lat==null||lon==null)&&geom.length){let slat=0,slon=0;for(const point of geom){slat+=num(point.lat);slon+=num(point.lon);}lat=slat/geom.length;lon=slon/geom.length;}
      if(!validCoord(lat,lon))continue;
      rows.push({osmType:e.type,osmId:e.id,ref,label:osmLabel(t,e.id),lat:Number(lat),lon:Number(lon),buildingType:t.building||null,levels:finite(t['building:levels'])?Number(t['building:levels']):null,footprintM2:polygonAreaM2(geom),address:[t['addr:housenumber'],t['addr:street']].filter(Boolean).join(' ')||null,city:t['addr:city']||p.address?.city||p.address?.town||p.address?.village||null,country:p.address?.country||null,postcode:t['addr:postcode']||null});
    }
    scoutMapCache.set(cacheKey,{at:Date.now(),rows});if(scoutMapCache.size>6)scoutMapCache.delete(scoutMapCache.keys().next().value);return rows;
  })();scoutMapCache.set(cacheKey,{pending:promise});try{return await promise;}catch(e){scoutMapCache.delete(cacheKey);throw e;}
}
async function scoutBuildings(q,radiusM=1000,limit=50,placeOverride=null,criteria={}){
  const key=JSON.stringify([q,radiusM,limit,placeOverride?.lat,placeOverride?.lon,criteria,scoutDataRevision]);
  const cached=scoutResultCache.get(key);if(cached&&(cached.pending||Date.now()-cached.at<45000)){
    const result=await(cached.pending||cached.result);
    return{...result,diagnostics:{...result.diagnostics,rawProperties:0,fullyEvaluated:0,rejectedType:0,rejectedDistance:0,rejectedArea:0,rejectedTraffic:0,rejectedOwnership:0,rejectedRooms:0,mapRequests:0,mapCacheHits:1,resultCacheHit:true,searchMs:0}};
  }
  const pending=computeScoutBuildings(q,radiusM,limit,placeOverride,criteria);scoutResultCache.set(key,{pending});
  try{const result=await pending;scoutResultCache.set(key,{at:Date.now(),result});if(scoutResultCache.size>8)scoutResultCache.delete(scoutResultCache.keys().next().value);return result;}
  catch(e){scoutResultCache.delete(key);throw e;}
}
async function computeScoutBuildings(q,radiusM=1000,limit=50,placeOverride=null,criteria={}){
  const started=Date.now(),stats={mapRequests:0,mapCacheHits:0,gameChunkRequests:0,rawProperties:0,rejectedType:0,rejectedDistance:0,rejectedArea:0,rejectedTraffic:0,rejectedOwnership:0,rejectedRooms:0,fullyEvaluated:0,matches:0};
  const places=placeOverride?[placeOverride]:await geocodeSearch(q,5);if(!places.length)throw new Error('Place was not found.');const p=places[0];radiusM=Math.min(5000,Math.max(100,Number(radiusM)||1000));limit=Math.min(120,Math.max(5,Number(limit)||50));
  const roomFilter=!!(num(criteria.minRooms)||num(criteria.maxRooms)||num(criteria.minRoomArea)||num(criteria.maxRoomArea)||criteria.vacantOnly);
  const gameOnly=roomFilter||criteria.onlyObserved||num(criteria.minTraffic)>0||criteria.ownership&&criteria.ownership!=='any';
  let stored=await chrome.storage.local.get([SCOUT_INDEX_KEY,SCOUT_ACCOUNT_KEY,...(gameOnly?[]:[PARCEL_INTEL_KEY]),OSM_REF_KEY]),index=stored[SCOUT_INDEX_KEY],account=stored[SCOUT_ACCOUNT_KEY],osmCache=stored[OSM_REF_KEY]||{};
  if(index==null||account==null){
    const legacy=await chrome.storage.local.get([...(index==null?[BUILDING_INTEL_KEY,UNIT_INTEL_KEY]:[]),...(account==null?[KEY]:[])]);
    if(index==null){index={};for(const x of Object.values(legacy[BUILDING_INTEL_KEY]||{}))if(x?.ref)index[x.ref]=scoutAnchor(x);
      for(const u of Object.values(legacy[UNIT_INTEL_KEY]||{}))if(u?.ref){const row=scoutUnitAnchor(u),old=index[u.ref]||{};index[u.ref]={...old,...Object.fromEntries(Object.entries(row).filter(([k,v])=>v!=null||k==='owner'||k==='landlord'||k==='listing'))};}
    }
    if(account==null){account={};for(const [scope,a] of Object.entries(legacy[KEY]?.accounts||{}))if(a?.id&&Array.isArray(a.properties))account[scope]={id:a.id,rows:a.properties.filter(x=>x?.ref).map(scoutAnchor)};}
    await chrome.storage.local.set({[SCOUT_INDEX_KEY]:index,[SCOUT_ACCOUNT_KEY]:account});
  }
  let osmRows=[],osmError=null;
  if(!gameOnly)try{osmRows=await scoutMapRows(p,radiusM,stats);}catch(e){osmError=e.message;}
  else{const key=`${Number(p.lat).toFixed(5)},${Number(p.lon).toFixed(5)}:${radiusM}`;for(const suffix of ['',':centers']){const cached=scoutMapCache.get(key+suffix);if(cached?.rows&&Date.now()-cached.at<SCOUT_MAP_TTL){osmRows=cached.rows;stats.mapCacheHits++;break;}}}
  const gameMap=new Map();
  for(const scope of Object.values(account||{}))for(const x of arr(scope?.rows)){if(!x?.ref)continue;gameMap.set(x.ref,{...gameMap.get(x.ref),...x});}
  for(const x of Object.values(index||{})){if(!x?.ref)continue;const old=gameMap.get(x.ref)||{};gameMap.set(x.ref,{...old,...Object.fromEntries(Object.entries(x).filter(([k,v])=>v!=null||k==='owner'||k==='landlord'||k==='listing'))});}
  if(gameOnly&&!osmRows.length){let needsCenters=false;for(const x of gameMap.values())if(!validCoord(x.lat,x.lon)&&!validCoord(osmCache[x.ref]?.lat,osmCache[x.ref]?.lon)&&scoutPass(x,criteria)){needsCenters=true;break;}
    if(needsCenters)try{osmRows=await scoutMapRows(p,radiusM,stats,true);}catch(e){osmError=e.message;}
  }
  const osmByRef=new Map(osmRows.map(r=>[r.ref,r]));
  const gameRows=[],unresolved=[];
  const latSpan=radiusM*1.35/110000,lonSpan=latSpan/Math.max(.02,Math.cos(Number(p.lat)*Math.PI/180));
  for(const x of gameMap.values()){stats.rawProperties++;if(validCoord(x.lat,x.lon)&&(Math.abs(Number(x.lat)-Number(p.lat))>latSpan||Math.abs(Number(x.lon)-Number(p.lon))>lonSpan)){stats.rejectedDistance++;continue;}
    if(!scoutPass(x,criteria,stats))continue;stats.fullyEvaluated++;
    const loc=osmByRef.get(x.ref)||osmCache[x.ref]||{},lat=validCoord(x.lat,x.lon)?Number(x.lat):loc.lat,lon=validCoord(x.lat,x.lon)?Number(x.lon):loc.lon;
    if(!validCoord(lat,lon)){if(osmRefParts(x.ref)&&!osmCache[x.ref]&&norm(x.label).includes(norm(q)))unresolved.push(x);continue;}
    const d=Math.round(distanceM(p,{lat,lon}));if(d>radiusM*1.35)continue;
    gameRows.push({...x,gameObserved:true,lat:Number(lat),lon:Number(lon),city:x.city||loc.city||null,state:x.state||loc.state||null,country:x.country||loc.country||null,distanceM:d});
  }
  // Limit network lookups to likely candidates. Unknown coordinates must never trigger
  // a lookup for every owned asset in an unrelated place.
  for(const x of unresolved.slice(0,2))try{const loc=await resolveOsmRef(x.ref);if(validCoord(loc.lat,loc.lon)){const d=Math.round(distanceM(p,loc));if(d<=radiusM*1.35)gameRows.push({...x,...loc,gameObserved:true,distanceM:d});}}catch(_){}
  gameRows.sort((a,b)=>a.distanceM-b.distanceM);
  const rows=[],gameByRef=new Map(gameRows.map(x=>[x.ref,x]));
  for(const r of osmRows){
    if(gameOnly)continue;const direct=gameMap.get(r.ref),match=direct&&scoutPass(direct,criteria)?gameByRef.get(r.ref):null;
    if(direct&&!match)continue;
    const area=match?match.area:r.footprintM2;
    if(num(criteria.minArea)>0&&(!finite(area)||Number(area)<num(criteria.minArea))||num(criteria.maxArea)>0&&(!finite(area)||Number(area)>num(criteria.maxArea))){stats.rejectedArea++;continue;}
    rows.push({...r,...(match?{gameMatch:match}:{})});
  }
  rows.sort((a,b)=>num(b.footprintM2)-num(a.footprintM2));
  const parcelRows=[];
  if(!gameOnly)for(const x of Object.values(stored[PARCEL_INTEL_KEY]||{})){if(!validCoord(x.lat,x.lon))continue;const d=Math.round(distanceM(p,x));if(d<=radiusM)parcelRows.push({...x,distanceM:d});}
  parcelRows.sort((a,b)=>num(b.busyness)-num(a.busyness)||num(b.areaM2)-num(a.areaM2)||a.distanceM-b.distanceM);
  stats.matches=gameRows.length+rows.length;stats.searchMs=Date.now()-started;
  return{place:{displayName:p.displayName,city:p.address?.city||p.address?.town||p.address?.village||null,country:p.address?.country||null,lat:p.lat,lon:p.lon},radiusM,gameRows:gameRows.slice(0,120),parcelRows:parcelRows.slice(0,120),rows:rows.slice(0,350),osmError,diagnostics:stats};
}

// ---- live market intelligence (read-only) ----
async function fetchMarketTickerPublic(){return gameGet('/market/ticker');}
async function fetchMarketBookPublic(commodity,realm=null){let path=`/market/book?commodity=${encodeURIComponent(commodity)}`;if(realm)path+=`&realm=${encodeURIComponent(realm)}`;return gameGet(path);}
async function fetchMarketHistoryPublic(commodity,window='24h'){return gameGet(`/market/history?commodity=${encodeURIComponent(commodity)}&window=${encodeURIComponent(window)}`);}
async function fetchShareBook(accountId,companyId){return gameGet(`/game/${encodeURIComponent(accountId)}/shares/book/${encodeURIComponent(companyId)}`);}
async function fetchShareHistory(accountId,companyId,window='24h'){return gameGet(`/game/${encodeURIComponent(accountId)}/shares/history/${encodeURIComponent(companyId)}?window=${encodeURIComponent(window)}`);}
function marketBookMetrics(book,hist,window='24h'){
  const bids=arr(book?.bids).filter(x=>finite(x?.price)&&Number(x.price)>0),asks=arr(book?.asks).filter(x=>finite(x?.price)&&Number(x.price)>0);
  const bestBid=bids.length?Math.max(...bids.map(x=>Number(x.price))):null,bestAsk=asks.length?Math.min(...asks.map(x=>Number(x.price))):null;
  const depth=list=>list.reduce((z,x)=>z+Math.max(0,num(x?.qty)),0);
  const out={bid:bestBid,ask:bestAsk,bidDepth:bids.length?depth(bids):null,askDepth:asks.length?depth(asks):null,spread:finite(book?.spread)?Number(book.spread):finite(bestBid)&&finite(bestAsk)?bestAsk-bestBid:null,base:finite(book?.base)?Number(book.base):null,npcBid:finite(book?.npcBid)?Number(book.npcBid):null,npcAsk:finite(book?.npcAsk)?Number(book.npcAsk):null,youHold:finite(book?.youHold)?Number(book.youHold):null,backing:finite(book?.backing)?Number(book.backing):null,price:finite(book?.last)?Number(book.last):finite(hist?.last)?Number(hist.last):null,...(book?{bookLevels:{bids:bids.length,asks:asks.length}}:{}),updatedAt:Date.now()};
  if(window==='24h'){out.volume=finite(hist?.volume)?Number(hist.volume):null;out.dayMove=finite(hist?.changePct)?Number(hist.changePct):finite(hist?.trendPct)?Number(hist.trendPct):null;out.trend=out.dayMove;}
  if(window==='30d'){out.change30dPct=finite(hist?.changePct)?Number(hist.changePct):null;out.volume30d=finite(hist?.volume)?Number(hist.volume):null;out.history30d=arr(hist?.closes).filter(finite).slice(-120);}
  return out;
}
function mergeMarketRows(all,rows,at=Date.now()){
  for(const r of arr(rows)){if(!r?.key)continue;const old=all[r.key]||{};if(r.observedAt&&old.observedAt&&Number(old.observedAt)>Number(r.observedAt))continue;const patch=trimRow(r),fresh=Object.fromEntries(Object.entries(patch).filter(([k,v])=>v!=null&&!(Array.isArray(v)&&!v.length&&Array.isArray(old[k])&&old[k].length)));
    all[r.key]={...old,...fresh,updatedAt:at};}
  return all;
}
async function mergeMarketIntel(rows){const s=await chrome.storage.local.get(MARKET_KEY),all=mergeMarketRows(s[MARKET_KEY]||{},rows);await chrome.storage.local.set({[MARKET_KEY]:all});return all;}
async function refreshMarketTicker(){const ticker=await fetchMarketTickerPublic(),items=arr(ticker?.items).map(it=>({key:norm(it?.label||it?.id),id:it?.id??null,commodityId:it?.id??null,name:text(it?.label||it?.id),kind:it?.kind||'good',price:finite(it?.price)?Number(it.price):null,dayMove:finite(it?.dayPct)?Number(it.dayPct):null,flat:!!it?.flat,tickerAt:ticker?.at??null,dayStartMs:ticker?.dayStartMs??null,source:'Capital Rift market ticker'}));await mergeMarketIntel(items);return{at:Date.now(),tickerAt:ticker?.at??null,dayStartMs:ticker?.dayStartMs??null,items};}
async function enrichMarketRows(items,accountId){const out=[];for(const it of arr(items).slice(0,30)){try{const kind=text(it?.kind).toLowerCase(),companyId=it?.companyId??(kind==='company'?it?.id:null),commodity=it?.commodityId??(kind!=='company'?it?.id:null)??it?.id;if(kind==='company'&&companyId&&accountId){const[book,hist]=await Promise.all([fetchShareBook(accountId,companyId),fetchShareHistory(accountId,companyId,'24h')]);out.push({...it,...marketBookMetrics(book,hist),key:`company:${companyId}`,companyId,source:'Capital Rift share book'});}else if(commodity){const[book,hist]=await Promise.all([fetchMarketBookPublic(commodity),fetchMarketHistoryPublic(commodity,'24h')]);out.push({...it,...marketBookMetrics(book,hist),key:it.key||norm(it.name||commodity),commodityId:commodity,source:'Capital Rift market book'});}}catch(e){out.push({...it,key:it.companyId?`company:${it.companyId}`:it.key||norm(it.name||it.id),liveError:e.message});}}await mergeMarketIntel(out);return out;}
let fullMarketScanRunning=false;
async function fullMarketScan(){if(fullMarketScanRunning)return{running:true};fullMarketScanRunning=true;const startedAt=Date.now();try{const tick=await refreshMarketTicker(),items=tick.items||[],rows=new Array(items.length),next={i:0,done:0,total:items.length};await chrome.storage.local.set({[MARKET_SCAN_PROGRESS_KEY]:{running:true,done:0,total:items.length,startedAt}});const runner=async()=>{while(true){const i=next.i++;if(i>=items.length)return;const it=items[i];try{const[book,hist]=await Promise.all([fetchMarketBookPublic(it.id),fetchMarketHistoryPublic(it.id,'24h')]);rows[i]={...it,...marketBookMetrics(book,hist),source:'Capital Rift full market scan'};}catch(e){rows[i]={...it,liveError:e.message};}next.done++;if(next.done%10===0||next.done===next.total)await chrome.storage.local.set({[MARKET_SCAN_PROGRESS_KEY]:{running:true,done:next.done,total:next.total,startedAt}});}};await Promise.all(Array.from({length:Math.min(8,items.length)},runner));await mergeMarketIntel(rows);const scan={running:false,scannedAt:Date.now(),durationMs:Date.now()-startedAt,itemCount:rows.length,errors:rows.filter(x=>x?.liveError).length};await chrome.storage.local.set({[MARKET_SCAN_KEY]:scan,[MARKET_SCAN_PROGRESS_KEY]:scan});return scan;}finally{fullMarketScanRunning=false;}}

// ---- company property purchaser attribution (read-only/passive) ----
function memberDirectory(snapshot){const m=new Map(),members=arr(snapshot?.companyProfile?.members);for(const x of members){const id=x?.playerId??x?.id;if(id!=null)m.set(String(id),x?.name||x?.playerName||String(id));}if(snapshot?.identity?.personalId)m.set(String(snapshot.identity.personalId),snapshot.identity.playerName||'You');return m;}
function attributionFromRow(row,members,properties){if(!row||typeof row!=='object')return null;const actorId=findDeep(row,['actorId','memberId','playerId','userId','buyerId','purchaserId','createdById','performedById']),actorName=findDeep(row,['actorName','memberName','playerName','buyerName','purchaserName','purchasedBy','createdBy','performedBy']),desc=text(findDeep(row,['desc','description','memo','label','name','title'],3)),refRaw=findDeep(row,['buildingRef','propertyRef','buildingId','propertyId'],4);let ref=refRaw!=null?String(refRaw):null;if(!ref&&desc){const hits=arr(properties).filter(p=>p?.label&&desc.toLowerCase().includes(String(p.label).toLowerCase()));if(hits.length===1)ref=String(hits[0].ref??hits[0].label);}if(!ref)return null;const name=actorName||members.get(String(actorId??''))||null;if(!name)return null;return{ref,name:text(name),playerId:actorId??null,source:'ledger',confidence:'high',at:Number(findDeep(row,['ts','time','timestamp','createdAt'],3))||Date.now()};}
async function updatePropertyBuyers(snapshot,previous){const s=await chrome.storage.local.get(PROPERTY_BUYERS_KEY),all=s[PROPERTY_BUYERS_KEY]||{},company=snapshot?.accounts?.company;if(!company||!snapshot?.identity?.companyId)return all;const prefix=String(snapshot.identity.companyId)+':',members=memberDirectory(snapshot),props=arr(company.properties);for(const acc of company?.bank?.accounts||[])for(const tx of acc?.transactions||[]){const a=attributionFromRow(tx,members,props);if(a)all[prefix+a.ref]={...(all[prefix+a.ref]||{}),...a,companyId:snapshot.identity.companyId};}for(const row of company?.history?.rows||[]){const a=attributionFromRow(row,members,props);if(a)all[prefix+a.ref]={...(all[prefix+a.ref]||{}),...a,companyId:snapshot.identity.companyId};}
  // Future-purchase fallback: if a new property appears while this signed-in
  // browser is piloting the company and no ledger actor is exposed, mark the
  // attribution as likely rather than pretending it is certain.
  const oldRefs=new Set(arr(previous?.accounts?.company?.properties).map(p=>String(p?.ref??'')).filter(Boolean));for(const p of props){const ref=String(p?.ref??'');if(!ref||oldRefs.has(ref)||all[prefix+ref])continue;all[prefix+ref]={ref,name:snapshot.identity.playerName||'Current signed-in member',playerId:snapshot.identity.personalId||null,source:'observed-session',confidence:'likely',at:snapshot.fetchedAt,companyId:snapshot.identity.companyId};}
  for(const p of props){const a=all[prefix+String(p?.ref??'')];if(a)p.purchaser=trimRow(a);}const keys=Object.keys(all).sort((a,b)=>num(all[b]?.at)-num(all[a]?.at));for(const k of keys.slice(6000))delete all[k];await chrome.storage.local.set({[PROPERTY_BUYERS_KEY]:all});return all;}
async function capturePurchaseRequest(obs){if(!obs||obs.kind!=='request'||String(obs.method||'GET').toUpperCase()==='GET')return;const url=String(obs.url||'');if(!/(buy-building|buy-parcel|room-offer|purchase|buy-room|acquire)/i.test(url))return;const ref=findDeep(obs.body||{},['buildingRef','propertyRef','ref','buildingId','propertyId'],4);if(ref==null)return;const s=await chrome.storage.local.get([KEY,PROPERTY_BUYERS_KEY]),snap=s[KEY];if(!snap?.identity?.companyId)return;const all=s[PROPERTY_BUYERS_KEY]||{},k=`${snap.identity.companyId}:${String(ref)}`;all[k]={ref:String(ref),name:snap.identity.playerName||'Current signed-in member',playerId:snap.identity.personalId||null,source:'observed-purchase-request',confidence:'high-local',at:obs.ts||Date.now(),companyId:snap.identity.companyId};await chrome.storage.local.set({[PROPERTY_BUYERS_KEY]:all});}

// ---- passive observations / enrichment ----
function objectWalk(data,visit,depth=0,seen=new WeakSet()){if(data==null||depth>6)return;if(typeof data==='object'){if(seen.has(data))return;seen.add(data);visit(data);if(Array.isArray(data)){for(const x of data.slice(0,500))objectWalk(x,visit,depth+1,seen);}else for(const x of Object.values(data))objectWalk(x,visit,depth+1,seen);}}
function observedFootprintBounds(points){if(!Array.isArray(points)||points.length<3)return null;let north=-Infinity,south=Infinity,east=-Infinity,west=Infinity,count=0;
  for(const p of points){const lat=Array.isArray(p)?p[1]:p?.lat,lon=Array.isArray(p)?p[0]:p?.lon??p?.lng;if(!validCoord(lat,lon))continue;count++;north=Math.max(north,Number(lat));south=Math.min(south,Number(lat));east=Math.max(east,Number(lon));west=Math.min(west,Number(lon));}
  return count>=3?{north,south,east,west}:null;
}
function observedScoutListing(row){const l=row?.listing;if(!l||typeof l!=='object')return null;const salePrice=pick(l,['price','purchasePrice','askingPrice','salePrice'],null);return{id:l.id??l.listingId??null,listingId:l.listingId??l.id??null,kind:l.kind??null,type:l.type??null,status:l.status??null,...('forSale' in l?{forSale:l.forSale===true}:{}),price:finite(salePrice)?Number(salePrice):null};}
function extractScoutParcels(data){
  // A chunk response can contain several parts and references to unchanged
  // chunks in `same`. Only actual chunks include parcel records.
  const parts=Array.isArray(data?.parts)?data.parts:[data],out=new Map();
  for(const part of parts){const chunks=part?.chunks||{};for(const chunk of Object.values(chunks)){
    for(const p of arr(chunk?.parcels)){
      if(!p?.id||!Array.isArray(p.centroid)||p.centroid.length<2)continue;
      const [lon,lat]=p.centroid;if(!validCoord(lat,lon))continue;
      out.set(String(p.id),{id:String(p.id),chunkId:text(p.chunkId||chunk.chunkId),lat:Number(lat),lon:Number(lon),footprintBounds:observedFootprintBounds(p.polygon),...('listing' in p?{listing:observedScoutListing(p)}:{}),areaM2:finite(p.areaM2)?Number(p.areaM2):null,busyness:finite(p.busyness)?Number(p.busyness):null,cityProximity:finite(p.cityProximity)?Number(p.cityProximity):null,value:finite(p.value)?Number(p.value):null,purchasePrice:finite(pick(p,['purchasePrice','salePrice','askingPrice'],null))?Number(pick(p,['purchasePrice','salePrice','askingPrice'],null)):null,...('owner' in p?{owner:p.owner==null?null:observedParty(p.owner)}:{})});
    }
  }}return [...out.values()];
}
function mergeScoutParcels(previous,rows,at=Date.now()){
  const all={...previous};for(const p of rows){const old=all[p.id]||{};if(old.observedAt>at)continue;
    all[p.id]={...old,...Object.fromEntries(Object.entries(p).filter(([k,v])=>v!==undefined&&(v!==null||k==='owner'||k==='listing'))),observedAt:at};}
  for(const key of Object.keys(all).sort((a,b)=>num(all[b].observedAt)-num(all[a].observedAt)).slice(6000))delete all[key];
  return all;
}
function observedParty(p){return p&&typeof p==='object'?{id:p.id??p.companyId??p.playerId??null,kind:p.kind??null,name:p.name??null,playerId:p.playerId??null,companyId:p.companyId??null}:null;}
function extractBuildingIntel(data,at=Date.now()){const out=[];const collect=o=>{if(Array.isArray(o)||!o||typeof o!=='object')return;const ref=propertyRefOf(o),c=coordsFrom(o),ft=pick(o,['footTraffic','busyness','trafficMultiplier'],null),price=pick(o,['appraisedValue','price','purchasePrice','value'],null),area=pick(o,['area','areaM2','floorArea','sqm'],null),label=propertyLabelOf(o,true);if(ref&&(validCoord(c.lat,c.lon)||finite(ft)||finite(price)||finite(area)||label)){out.push({ref,label:label||String(ref),lat:validCoord(c.lat,c.lon)?c.lat:null,lon:validCoord(c.lat,c.lon)?c.lon:null,footTraffic:finite(ft)?Number(ft):null,price:finite(price)?Number(price):null,area:finite(area)?Number(area):null,city:pick(o,['city','cityName'],null),state:pick(o,['state','region'],null),country:pick(o,['country','countryName'],null),floors:pick(o,['floors','floorCount','levels'],null),usableFloors:o.usableFloors??null,archetype:o.archetype??null,subtype:o.subtype??null,kind:pick(o,['kind','type','buildingType'],null),footprintBounds:observedFootprintBounds(o.polygon||o.geometry||o.footprint),...('listing' in o?{listing:observedScoutListing(o)}:{}),...('owner' in o?{owner:observedParty(o.owner)}:{}),...('landlord' in o?{landlord:observedParty(o.landlord)}:{}),at});}};
  // A single building detail is a common case; its hundreds of units cannot contain another building.
  if(data?.ref&&Array.isArray(data.rentableUnits))collect(data);else objectWalk(data,collect);return out;}
function extractRetailBuildings(data){
  const buildings=[];const collect=o=>{
    if(!o||Array.isArray(o)||!Array.isArray(o.rentableUnits)||!o.ref)return;
    const ref=String(o.ref),units=[];for(const u of o.rentableUnits){
      if(!u?.key||!String(u.key).startsWith(`${ref}/`))continue;
      const row={key:String(u.key)};
      for(const k of ['label','kind','status','tenantId','tenantName','busyWith','floor','rooms','areaM2','rentPerDay','fairRentPerDay','furnishValue','tenantBought'])if(u[k]!=null)row[k]=u[k];
      if('tenantId' in u&&u.tenantId===null)row.tenantId=null;
      if('tenantName' in u&&u.tenantName===null)row.tenantName=null;
      units.push(row);
    }
    if(units.length||o.rentableUnits.length===0)buildings.push({ref,units,label:o.label??null,areaM2:o.areaM2??null,paidPrice:o.paidPrice??null,value:o.value??null,busyness:o.busyness??null,floors:o.floors??null,usableFloors:o.usableFloors??null,archetype:o.archetype??null,subtype:o.subtype??null,...('owner' in o?{owner:observedParty(o.owner)}:{}),...('landlord' in o?{landlord:observedParty(o.landlord)}:{}),hasOpenShop:typeof o.hasOpenShop==='boolean'?o.hasOpenShop:null,hasOpenBusiness:typeof o.hasOpenBusiness==='boolean'?o.hasOpenBusiness:null});
  };if(data?.ref&&Array.isArray(data.rentableUnits))collect(data);else objectWalk(data,collect);return buildings;
}
function mergeRetailBuildings(previous,buildings,at=Date.now()){
  const all={...previous};for(const building of buildings){const old=all[building.ref]||{},units={...(old.units||{})};
    for(const u of building.units){const before=units[u.key]||{};if(before.observedAt>at)continue;units[u.key]={...before,...u,observedAt:at};}
    if(old.observedAt>at){all[building.ref]={...old,units};continue;}
    const fields=Object.fromEntries(Object.entries(building).filter(([k,v])=>k!=='units'&&(v!=null||k==='owner'||k==='landlord'||k==='listing')));
    all[building.ref]={...old,...fields,units,observedAt:at};
  }
  for(const ref of Object.keys(all).sort((a,b)=>num(all[b].observedAt)-num(all[a].observedAt)).slice(500))delete all[ref];
  return all;
}
function extractMarketIntel(data,options={}){
  const rows=[];objectWalk(data,o=>{if(Array.isArray(o)||!o||typeof o!=='object')return;
    const name=pick(o,['name','symbol','short','ticker','itemName','companyName'],null),price=pick(o,['lastPrice','price','last','marketPrice'],null),bid=pick(o,['bestBid','bid','bidPrice'],null),ask=pick(o,['bestAsk','ask','askPrice'],null),volume=pick(o,['volume24h','volume','dayVolume'],null),marketCap=pick(o,['marketCap','marketCapitalization'],null);
    if(name&&(finite(price)||finite(bid)||finite(ask)||finite(volume)||finite(marketCap))){const companyId=o.companyId??null,change=pick(o,['dayMove','changePct','percentChange','dayChangePct'],null),r={key:companyId?`company:${companyId}`:norm(name),name:text(name),kind:companyId?'company':pick(o,['kind','type','category'],'market'),companyId,price:finite(price)?Number(price):null,bid:finite(bid)?Number(bid):null,ask:finite(ask)?Number(ask):null,volume:finite(volume)?Number(volume):null,marketCap:finite(marketCap)?Number(marketCap):null,at:Date.now()};
      if(options.window==='30d'){r.change30dPct=finite(change)?Number(change):null;r.volume30d=r.volume;r.volume=null;}
      else r.dayMove=finite(change)?Number(change):null;
      for(const field of ['backing','yieldPct','holders','sharesOutstanding','floatBps','ipoPrice','listedAt','lastTradeAt'])if(o[field]!=null)r[field]=o[field];
      rows.push(r);}
  });return rows;
}
function extractIpoListings(data){const items=Array.isArray(data)?data:Array.isArray(data?.listings)?data.listings:Array.isArray(data?.offerings)?data.offerings:[];
  return items.filter(x=>x&&typeof x==='object'&&x.listingId&&x.companyId&&x.name&&finite(x.floorPrice)&&finite(x.sharesOffered)).map(x=>({listingId:String(x.listingId),companyId:String(x.companyId),name:text(x.name),floatBps:finite(x.floatBps)?Number(x.floatBps):null,sharesOffered:Number(x.sharesOffered),floorPrice:Number(x.floorPrice),bookValueAtFiling:finite(x.bookValueAtFiling)?Number(x.bookValueAtFiling):null,endsAt:finite(x.endsAt)?Number(x.endsAt):null,demand:finite(x.demand)?Number(x.demand):null,bidders:finite(x.bidders)?Number(x.bidders):null}));
}
function mergeIpoListings(cache,data,at=Date.now()){
  const result={...cache};for(const r of extractIpoListings(data)){const old=result[r.listingId]||{};if(old.observedAt>at)continue;result[r.listingId]={...old,...Object.fromEntries(Object.entries(r).filter(([,v])=>v!=null)),observedAt:at};}
  return result;
}
function extractRentMarkets(data,at=Date.now(),accountId=null){
  // These are regional market totals, never account holdings. A partial
  // response updates only the regions and types it actually reports.
  const metric=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  return arr(data?.markets).filter(m=>m&&typeof m.regionId==='string'&&m.regionId.length<120).map(m=>({
    regionId:m.regionId,accountId,at,pool:metric(m.pool),housed:metric(m.housed),looking:metric(m.looking),listings:metric(m.listings),yours:metric(m.yours),provisional:typeof m.provisional==='boolean'?m.provisional:null,
    types:arr(m.types).filter(t=>t&&typeof t.type==='string'&&t.type.length<60).slice(0,30).map(t=>({type:t.type,pool:metric(t.pool),housed:metric(t.housed),looking:metric(t.looking),listings:metric(t.listings),yours:metric(t.yours)}))
  }));
}
function mergeRentMarkets(previous,rows){
  const out={...previous};
  for(const row of rows){
    if(row.accountId==null)continue;
    const key=`${row.accountId}:${row.regionId}`,prior=out[key]||{};
    if(prior.at>row.at)continue;
    const types=new Map(arr(prior.types).map(t=>[t.type,t]));
    for(const t of row.types)types.set(t.type,{...types.get(t.type),...Object.fromEntries(Object.entries(t).filter(([,v])=>v!=null))});
    out[key]={...prior,...Object.fromEntries(Object.entries(row).filter(([k,v])=>k!=='types'&&v!=null)),types:[...types.values()]};
  }
  return out;
}
function extractShopStock(data,at=Date.now()){
  const byShop=new Map(),seen=new Set();
  for(const piece of arr(data?.furniture)){
    const sale=piece?.sale,id=sale?.shopId,unit=sale?.qty;
    if(id==null||piece?.id==null||seen.has(String(piece.id))||unit==null||!finite(unit))continue;
    seen.add(String(piece.id));const key=String(id),old=byShop.get(key)||{shopId:key,buildingRef:piece.buildingRef??null,shelves:0,emptyShelves:0,stockedUnits:0,at};
    old.shelves++;if(Number(unit)<=0)old.emptyShelves++;old.stockedUnits+=Math.max(0,Number(unit));byShop.set(key,old);
  }
  return [...byShop.values()];
}
function mergeShopStock(previous,rows,accounts){
  const out={...previous},owned=new Map();
  for(const account of accounts)for(const row of arr(account?.income?.sources?.shops?.rows)){
    const id=row?.id??row?.shopId;if(id!=null)owned.set(`${account.id}:${id}`,String(row.buildingRef??''));
  }
  for(const row of rows)for(const [key,ref] of owned){
    if(!key.endsWith(`:${row.shopId}`)||ref&&row.buildingRef&&ref!==String(row.buildingRef))continue;
    const prior=out[key];if(prior&&(prior.at>row.at||prior.buildingRef===row.buildingRef&&prior.shelves>row.shelves))continue;
    out[key]=row;
  }
  return out;
}
async function loadShopStock(accountId,shopId){
  const s=await chrome.storage.local.get([KEY,SHOP_STOCK_KEY]),account=Object.values(s[KEY]?.accounts||{}).find(a=>String(a?.id)===String(accountId));
  const shop=arr(account?.income?.sources?.shops?.rows).find(r=>String(r?.id??r?.shopId)===String(shopId));
  if(!shop?.buildingRef||!shop?.chunkId)throw new Error('This shop has no game building and chunk IDs for a stock read.');
  const data=await gameGet(`/building-furniture?ref=${encodeURIComponent(shop.buildingRef)}&chunk=${encodeURIComponent(shop.chunkId)}`);
  const rows=extractShopStock(data);
  if(rows.length)await chrome.storage.local.set({[SHOP_STOCK_KEY]:mergeShopStock(s[SHOP_STOCK_KEY]||{},rows,[account])});
  return rows.find(r=>String(r.shopId)===String(shopId))||{shopId,shelves:0,emptyShelves:0};
}
async function storeObservation(obs){
  if(!obs||obs.kind!=='response'||!obs.data||!(Number(obs.status)>=200&&Number(obs.status)<300))return;
  if(obs.data.scoutMapTile){await storeScoutMapTile(obs.data,obs.ts||Date.now());return;}
  const gameChunk=/\/api\/chunk\/(\d{1,2}\/\d+\/\d+)(?:[?#]|$)/.exec(String(obs.url||''));
  if(gameChunk){const rows=scoutGameChunkBuildings(obs.data,gameChunk[1]);if(rows)await storeScoutMapTile(rows,obs.ts||Date.now());return;}
  // Observed structured feeds are stored as small projections by stable IDs.
  // The retail endpoint URL is not established by the captures; shape is checked
  // instead. Avoid putting its full item list in the generic observation cache.
  const observedId=/\/api\/game\/([^/?#]+)\//.exec(String(obs.url||''))?.[1]||null;
  let observedAccount=null;try{observedAccount=observedId?decodeURIComponent(observedId):null;}catch(_){observedAccount=observedId;}
  const observedAt=obs.ts||Date.now();
  const capByAge=(rows,limit)=>{const keys=Object.keys(rows);if(keys.length>limit)for(const key of keys.sort((a,b)=>(rows[b]?.observedAt||0)-(rows[a]?.observedAt||0)).slice(limit))delete rows[key];};
  const retail=typeof CRCCRegionData!=='undefined'?CRCCRegionData.retail(obs.data,observedAt):null;
  if(retail){const s=await chrome.storage.local.get(REGION_INTEL_KEY),all=s[REGION_INTEL_KEY]||{},key=`${observedAccount||'observed'}:${retail.areaId}`;if((all[key]?.observedAt||0)<=observedAt){all[key]=retail;capByAge(all,40);await chrome.storage.local.set({[REGION_INTEL_KEY]:all});}return;}
  const region=typeof CRCCRegionData!=='undefined'?CRCCRegionData.region(obs.data,observedAt):null;
  if(region){const s=await chrome.storage.local.get(REGION_INFO_KEY),all=s[REGION_INFO_KEY]||{},key=`${observedAccount||'observed'}:${region.areaId}`;if((all[key]?.observedAt||0)<=observedAt){all[key]=region;capByAge(all,100);await chrome.storage.local.set({[REGION_INFO_KEY]:all});}return;}
  if(/\/shop-history(?:[/?#]|$)/.test(String(obs.url||''))){const history=typeof CRCCRegionData!=='undefined'?CRCCRegionData.history(obs.data,observedAt):null;if(history){const s=await chrome.storage.local.get(SHOP_HISTORY_KEY),all=s[SHOP_HISTORY_KEY]||{},key=`${observedAccount||'observed'}:${history.shopId}`;if((all[key]?.observedAt||0)<=observedAt){all[key]=history;capByAge(all,150);await chrome.storage.local.set({[SHOP_HISTORY_KEY]:all});}}return;}
  const method=String(obs.method||'GET').toUpperCase();
  if(method!=='GET'&&!(method==='POST'&&/chunk|parcel|terrain|world|map|tile/i.test(String(obs.url||''))&&Array.isArray(obs.data?.parts)))return;
  const url=String(obs.url||''),at=obs.ts||Date.now(),isRentMarket=/\/rent-market(?:[/?#]|$)/i.test(url),isFurniture=/\/(?:building-)?furniture(?:[/?#]|$)/i.test(url),isMarket=/market|share|order|ticker|quote|ipo|offering/i.test(url),isChunkResponse=Array.isArray(obs.data?.parts)&&obs.data.parts.some(p=>p?.chunks&&typeof p.chunks==='object');
  const isBuilding=/building|room|property|shop|inspect|detail|resolve/i.test(url),isUnits=Array.isArray(obs.data?.rentableUnits)||/building|property|room|world|map|inspect|detail|resolve/i.test(url),isParcels=isChunkResponse||/chunk|parcel|terrain|world|map/i.test(url);
  const s=await chrome.storage.local.get([OBS_KEY,...(isBuilding?[BUILDING_INTEL_KEY]:[]),...(isUnits?[UNIT_INTEL_KEY]:[]),...(isParcels?[PARCEL_INTEL_KEY]:[]),...(isBuilding||isUnits||isChunkResponse?[SCOUT_INDEX_KEY]:[]),...(isChunkResponse?[SCOUT_CHUNK_KEY]:[]),...(isMarket&&!isRentMarket?[MARKET_KEY,IPO_KEY]:[]),...(isRentMarket?[RENT_MARKET_KEY]:[]),...(isFurniture?[SHOP_STOCK_KEY,KEY]:[])]),cache=s[OBS_KEY]||{},key=url.replace(API,'').slice(0,220);
  cache[key]={at,status:obs.status,data:isFurniture?{furnitureCount:arr(obs.data?.furniture).length}:isChunkResponse?{parts:obs.data.parts.length,chunkIds:[...new Set(obs.data.parts.flatMap(p=>Object.keys(p?.chunks||{})))].slice(0,30)}:Array.isArray(obs.data?.rentableUnits)?{ref:obs.data.ref,unitCount:obs.data.rentableUnits.length}:isBuilding?{ref:obs.data.ref??null}:trimValue(obs.data,0)};
  const keys=Object.keys(cache).sort((a,b)=>cache[b].at-cache[a].at);for(const k of keys.slice(80))delete cache[k];const update={[OBS_KEY]:cache};
  if(isChunkResponse){const next=scoutChunkRows(obs.data,at),all={...(s[SCOUT_CHUNK_KEY]||{})};for(const[id,row]of Object.entries(next))if(num(all[id]?.at)<=at)all[id]={...all[id],...row,buildingRefs:row.buildingsReported?row.buildingRefs:all[id]?.buildingRefs||[],buildingsReported:row.buildingsReported||!!all[id]?.buildingsReported,parcelCount:row.parcelsReported?row.parcelCount:all[id]?.parcelCount||0};
    update[SCOUT_CHUNK_KEY]=all;
  }
  if(method==='POST'){
    const parcels=extractScoutParcels(obs.data);
    if(parcels.length){update[PARCEL_INTEL_KEY]=mergeScoutParcels(s[PARCEL_INTEL_KEY]||{},parcels,at);scoutDataRevision++;}
    if(isChunkResponse){const index={...(s[SCOUT_INDEX_KEY]||{})};let changed=mergeScoutChunkBuildings(index,obs.data,at),buildings=[];
      for(const part of arr(obs.data.parts))for(const chunk of Object.values(part?.chunks||{}))for(const collection of ['buildings','properties'])for(const item of scoutCollection(chunk?.[collection]))if(Array.isArray(item?.rentableUnits))buildings.push(...extractRetailBuildings(item));
      if(buildings.length){const merged=mergeRetailBuildings(s[UNIT_INTEL_KEY]||{},buildings,at);update[UNIT_INTEL_KEY]=merged;for(const building of buildings){const old=index[building.ref]||{};index[building.ref]={...old,...scoutUnitAnchor(merged[building.ref]),chunkId:old.chunkId};update[SCOUT_UNIT_PREFIX+building.ref]=scoutUnitRecord(merged[building.ref]);changed=true;}}
      if(changed)update[SCOUT_INDEX_KEY]=index;
    }
    if(update[SCOUT_CHUNK_KEY])scoutDataRevision++;
    await chrome.storage.local.set(update);return;
  }
  const scoutIndex={...(s[SCOUT_INDEX_KEY]||{})};let scoutChanged=false;
  if(s[SCOUT_INDEX_KEY]==null){const legacy=await chrome.storage.local.get([BUILDING_INTEL_KEY,UNIT_INTEL_KEY]);for(const x of Object.values(legacy[BUILDING_INTEL_KEY]||{}))if(x?.ref)scoutIndex[x.ref]=scoutAnchor(x);
    for(const u of Object.values(legacy[UNIT_INTEL_KEY]||{}))if(u?.ref)scoutIndex[u.ref]={...scoutIndex[u.ref],...scoutUnitAnchor(u)};scoutChanged=true;}
  if(isBuilding){const bi=s[BUILDING_INTEL_KEY]||{};for(const x of extractBuildingIntel(obs.data,at)){const old=bi[x.ref]||{};if(old.at>at)continue;bi[x.ref]={...old,...Object.fromEntries(Object.entries(x).filter(([k,v])=>v!=null||k==='owner'||k==='landlord'||k==='listing')),at};const previous=scoutIndex[x.ref]||{};scoutIndex[x.ref]={...previous,...Object.fromEntries(Object.entries(scoutAnchor(x)).filter(([k,v])=>v!=null||k==='owner'||k==='landlord'||k==='listing'))};scoutChanged=true;}update[BUILDING_INTEL_KEY]=bi;}
  if(isUnits){
    const buildings=extractRetailBuildings(obs.data);
    if(buildings.length){const merged=mergeRetailBuildings(s[UNIT_INTEL_KEY]||{},buildings,at);update[UNIT_INTEL_KEY]=merged;
      for(const b of buildings){const u=merged[b.ref];if(!u||u.observedAt>at)continue;const row=scoutUnitAnchor(u),previous=scoutIndex[b.ref]||{};scoutIndex[b.ref]={...previous,...Object.fromEntries(Object.entries(row).filter(([k,v])=>v!=null||k==='owner'||k==='landlord'||k==='listing'))};update[SCOUT_UNIT_PREFIX+b.ref]=scoutUnitRecord(u);scoutChanged=true;}
    }
  }
  if(scoutChanged)update[SCOUT_INDEX_KEY]=scoutIndex;
  if(isChunkResponse&&mergeScoutChunkBuildings(scoutIndex,obs.data,at))update[SCOUT_INDEX_KEY]=scoutIndex;
  if(isChunkResponse||/chunk|parcel|terrain|world|map/i.test(url)){
    const parcels=extractScoutParcels(obs.data);
    if(parcels.length)update[PARCEL_INTEL_KEY]=mergeScoutParcels(s[PARCEL_INTEL_KEY]||{},parcels,at);
  }
  if(isMarket&&!isRentMarket){const window=/[?&]window=30d(?:&|$)/i.test(url)?'30d':'24h',rows=extractMarketIntel(obs.data,{window}),companyId=String(obs.data?.companyId||/\/shares\/(?:book|history)\/([^/?#]+)/i.exec(url)?.[1]||'');
    if(companyId&&/\/shares\/book\//i.test(url)&&Array.isArray(obs.data?.bids)&&Array.isArray(obs.data?.asks))rows.push({key:`company:${companyId}`,companyId,kind:'company',observedAt:at,...marketBookMetrics(obs.data,null),source:'Capital Rift share book'});
    if(companyId&&/\/shares\/history\//i.test(url))rows.push({key:`company:${companyId}`,companyId,kind:'company',observedAt:at,...marketBookMetrics(null,obs.data,window),source:`Capital Rift share history ${window}`});
    if(rows.length)update[MARKET_KEY]=mergeMarketRows(s[MARKET_KEY]||{},rows.map(r=>({...r,observedAt:at})),at);
    if(/ipo|offering|filing/i.test(url)){const merged=mergeIpoListings(s[IPO_KEY]||{},obs.data,at);if(Object.keys(merged).length)update[IPO_KEY]=merged;}
  }
  if(isRentMarket){const rows=extractRentMarkets(obs.data,at,/\/game\/([^/?]+)\/rent-market(?:[/?#]|$)/i.exec(url)?.[1]||null);if(rows.length)update[RENT_MARKET_KEY]=mergeRentMarkets(s[RENT_MARKET_KEY]||{},rows);}
  if(isFurniture){const stock=extractShopStock(obs.data,at);if(stock.length)update[SHOP_STOCK_KEY]=mergeShopStock(s[SHOP_STOCK_KEY]||{},stock,Object.values(s[KEY]?.accounts||{}));}
  if(update[SCOUT_INDEX_KEY]||update[PARCEL_INTEL_KEY]||update[SCOUT_CHUNK_KEY])scoutDataRevision++;
  await chrome.storage.local.set(update);
  if(/\/asset|\/holding/i.test(url)){
    const scope=await chrome.storage.local.get(ASSET_OBS_KEY),scopedId=/\/game\/([^/?]+)/.exec(url)?.[1],me=scopedId?null:await gameGet('/me').catch(()=>null),accountId=scopedId||activeAccountFromMe(me).id;
    if(accountId){const all=scope[ASSET_OBS_KEY]||{},recordKey=`${accountId}:${key}`;
      all[recordKey]={at:obs.ts||Date.now(),accountId,data:trimValue(obs.data,0,5000)};
      for(const old of Object.keys(all).sort((a,b)=>num(all[b]?.at)-num(all[a]?.at)).slice(25))delete all[old];
      await chrome.storage.local.set({[ASSET_OBS_KEY]:all});
    }
  }
}
async function saveShopHealth(payload){if(!payload?.accountId||!payload?.shopKey)return;const s=await chrome.storage.local.get(HEALTH_KEY),all=s[HEALTH_KEY]||{},k=`${payload.accountId}:${payload.shopKey}`,prev=all[k]||{};if(prev.at&&payload.at&&Number(payload.at)<Number(prev.at))return;const fields=Object.fromEntries(Object.entries(trimRow(payload)).filter(([,v])=>v!=null&&v!==''));
  // Timestamp-only polls must not write the entire health cache or notify every UI.
  const changed=Object.entries(fields).some(([key,value])=>!['at','appealAt','localDemandAt'].includes(key)&&JSON.stringify(prev[key])!==JSON.stringify(value));
  if(!changed&&Date.now()-num(prev.updatedAt)<60000)return;
  all[k]={...prev,...fields,updatedAt:Date.now()};
  if(Object.keys(all).length>6000){const keys=Object.keys(all).sort((a,b)=>num(all[b].updatedAt)-num(all[a].updatedAt));for(const x of keys.slice(6000))delete all[x];}
  await chrome.storage.local.set({[HEALTH_KEY]:all});}
async function saveNavigationAnchor(payload){if(!payload?.accountId||!payload?.entityKey||!validCoord(payload.lat,payload.lon))return;const s=await chrome.storage.local.get(NAV_ANCHOR_KEY),all=s[NAV_ANCHOR_KEY]||{},k=`${payload.accountId}:${payload.entityKey}`;all[k]={accountId:payload.accountId,entityKey:payload.entityKey,label:text(payload.label),lat:Number(payload.lat),lon:Number(payload.lon),zoom:finite(payload.zoom)?Number(payload.zoom):420,source:payload.source||'official-focus',verified:true,updatedAt:Date.now()};const keys=Object.keys(all).sort((a,b)=>num(all[b].updatedAt)-num(all[a].updatedAt));for(const x of keys.slice(6000))delete all[x];await chrome.storage.local.set({[NAV_ANCHOR_KEY]:all});}


// ---- rename learning / only game write ----
// v0.6.31 expands the learned-write layer to explicitly confirmed land batches.
// ---- learned game-write templates: rename + land purchase ----
function flatten(obj,prefix='',out={}){if(!obj||typeof obj!=='object'||Array.isArray(obj))return out;for(const[k,v]of Object.entries(obj)){const p=prefix?`${prefix}.${k}`:k;if(v&&typeof v==='object'&&!Array.isArray(v))flatten(v,p,out);else if(['string','number','boolean'].includes(typeof v)||v==null)out[p]=v;}return out;}
function getPath(obj,path){return path.split('.').reduce((o,k)=>o==null?undefined:o[k],obj);}function setPath(obj,path,value){const parts=path.split('.');let cur=obj;for(let i=0;i<parts.length-1;i++){if(!cur[parts[i]]||typeof cur[parts[i]]!=='object')cur[parts[i]]={};cur=cur[parts[i]];}cur[parts.at(-1)]=value;}const cloneJson=x=>JSON.parse(JSON.stringify(x));
function tokenFor(path){return `__CRCC_${btoa(path).replace(/=/g,'')}__`;}
function urlTemplateFromObservation(url,row){let out=url;const flat=flatten(row||{}),candidates=Object.entries(flat).filter(([k,v])=>v!=null&&String(v).length>=4&&/(id|key|ref|unit|room|shop|store|business)/i.test(k)).sort((a,b)=>String(b[1]).length-String(a[1]).length);const urlMap={};for(const[path,value]of candidates){const raw=String(value),enc=encodeURIComponent(raw);if(out.includes(raw)){out=out.split(raw).join(tokenFor(path));urlMap[tokenFor(path)]=path;}else if(out.includes(enc)){out=out.split(enc).join(tokenFor(path));urlMap[tokenFor(path)]=path;}}return{urlTemplate:out,urlMap};}
function deriveRenameTemplate(obs,learning){const body=obs?.body;if(!body||typeof body!=='object'||Array.isArray(body))return null;const flatBody=flatten(body),flatRow=flatten(learning?.shop||{}),namePath=Object.keys(flatBody).find(p=>String(flatBody[p])===String(learning.marker));if(!namePath)return null;const mapping={};for(const[bp,bv]of Object.entries(flatBody)){if(bp===namePath)continue;const same=flatRow[bp]!==undefined&&String(flatRow[bp])===String(bv)?bp:null;const semantic=Object.keys(flatRow).find(k=>String(flatRow[k])===String(bv)&&bv!==''&&bv!=null&&/(id|key|ref|unit|room|shop|store|business)/i.test(k));if(same||semantic)mapping[bp]=same||semantic;}const u=urlTemplateFromObservation(obs.url,learning?.shop||{});return{learnedAt:Date.now(),url:obs.url,urlTemplate:u.urlTemplate,urlMap:u.urlMap,method:String(obs.method||'POST').toUpperCase(),baseBody:body,namePath,mapping};}
function ownedBuilding(snapshot,scope,accountId,ref){const a=snapshot?.accounts?.[scope];return a&&String(a.id)===String(accountId)&&arr(a.assetInventory?.buildings).some(b=>b.ref!=null&&String(b.ref)===String(ref));}

function landRefAliases(ref){const raw=String(ref??'');if(!raw)return[];const bare=raw.replace(/^parcel\//i,'');return[...new Set([raw,bare,`parcel/${bare}`].filter(Boolean))];}
function landRequestHasAlias(url,body,ref){const aliases=landRefAliases(ref),flat=flatten(body||{});return aliases.some(id=>String(url||'').includes(id)||String(url||'').includes(encodeURIComponent(id))||Object.values(flat).some(v=>String(v)===id));}
function landOwnedBy(row,scope,accountId){const owner=row?.owner;if(!owner||!accountId)return false;return[owner.id,scope==='company'?owner.companyId:owner.playerId].some(id=>id!=null&&String(id)===String(accountId));}
function findLandRow(rows,ref){return landRefAliases(ref).map(id=>rows?.[id]).find(Boolean)||null;}
async function observeLandDetail(obs){
  if(obs.kind!=='response'||!/^GET$/i.test(obs.method)||!/(?:land|parcel)/i.test(obs.url||'')||obs.status<200||obs.status>=300)return;
  const detail=obs.data?.parcel??obs.data?.land??obs.data;if(!detail||Array.isArray(detail)||typeof detail!=='object')return;
  const ref=detail.parcelId??detail.landId??detail.ref??detail.id;if(ref==null)return;
  const s=await chrome.storage.local.get([PARCEL_INTEL_KEY,KEY]),all={...(s[PARCEL_INTEL_KEY]||{})},old=findLandRow(all,ref);if(!old)return;
  const fields={};if('owner' in detail)fields.owner=detail.owner==null?null:observedParty(detail.owner);
  if(landRequestHasAlias(obs.url,null,ref))fields.detailUrl=obs.url;
  // The land panel can expose an offer separately from map chunk appraisal.
  // Only explicit game sale signals become a purchase listing.
  if('listing' in detail||'purchaseOffer' in detail||'saleOffer' in detail){const offer=detail.listing??detail.purchaseOffer??detail.saleOffer??null,explicitSale='purchaseOffer' in detail||'saleOffer' in detail;fields.listing=offer?observedScoutListing({listing:explicitSale?{kind:'sale',...offer}:offer}):null;}
  const purchasePrice=pick(detail,['purchasePrice','salePrice','askingPrice'],null);
  if(finite(purchasePrice))fields.purchasePrice=Number(purchasePrice);
  if(!('listing' in fields)&&finite(purchasePrice)&&(detail.canBuy===true||detail.canPurchase===true||detail.forSale===true))fields.listing={kind:'sale',forSale:true,price:Number(purchasePrice)};
  const scope=s[KEY]?.identity?.companyId?'company':'character',accountId=scope==='company'?s[KEY]?.identity?.companyId:s[KEY]?.identity?.personalId;
  if('owner' in fields)fields.myOwned=landOwnedBy(fields,scope,accountId);
  if(!Object.keys(fields).length)return;
  const id=String(old.id),row={...old,...fields,detailObservedAt:Date.now(),observedAt:Math.max(num(old.observedAt),Number(obs.ts)||Date.now())};all[id]=row;
  await chrome.storage.local.set({[PARCEL_INTEL_KEY]:all});scoutDataRevision++;viewportSurveyCache.clear();
}
function landDetailUrlFor(ref,observedUrl,sourceRef){
  if(!observedUrl||!sourceRef)return null;
  const alias=landRefAliases(sourceRef).sort((a,b)=>b.length-a.length).find(id=>observedUrl.includes(encodeURIComponent(id))||observedUrl.includes(id));if(!alias)return null;
  const target=alias.startsWith('parcel/')?`parcel/${String(ref).replace(/^parcel\//i,'')}`:String(ref).replace(/^parcel\//i,'');
  const url=observedUrl.includes(encodeURIComponent(alias))?observedUrl.replace(encodeURIComponent(alias),encodeURIComponent(target)):observedUrl.replace(alias,target);
  return url.startsWith(API+'/')&&!url.includes('__CRCC_')?url:null;
}
function deriveLandBuyTemplate(obs,learning){
  if(!learning?.active||Date.now()-num(learning.startedAt)>5*60000||!['POST','PUT','PATCH'].includes(String(obs?.method||'').toUpperCase()))return null;
  const url=String(obs.url||''),parcel=learning.parcel||{},ref=String(parcel.ref||'');
  const action=flatten(obs.body||{});if(!ref||!(/(?:buy|purchase|acquire)/i.test(url)||Object.entries(action).some(([key,value])=>/(?:action|operation|type)$/i.test(key)&&/^(?:buy|purchase|acquire)(?:[_-]?(?:land|parcel))?$/i.test(String(value))))||!landRequestHasAlias(url,obs.body,ref))return null;
  if(obs.body!=null&&(typeof obs.body!=='object'||Array.isArray(obs.body)))return null;const hadBody=obs.body!=null,body=hadBody?obs.body:{},flatBody=flatten(body),flatParcel=flatten(parcel),mapping={};
  const accountKeys=new Set(['accountId','companyId','playerId','ownerId','actorId','userId']);
  const sameValue=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
  for(const[bp,bv]of Object.entries(flatBody)){
    const leaf=bp.split('.').at(-1);if(accountKeys.has(leaf))continue;
    let rp=null;
    if(/(?:^|\.)(?:parcelId|landId|parcelRef|landRef|ref|id)$/i.test(bp)&&landRefAliases(ref).some(x=>String(bv)===x)){const leafKey=bp.split('.').at(-1);rp=flatParcel[leafKey]!==undefined&&sameValue(flatParcel[leafKey],bv)?leafKey:(sameValue(parcel.parcelId,bv)?'parcelId':sameValue(parcel.landId,bv)?'landId':sameValue(parcel.id,bv)?'id':'ref');}
    if(!rp&&/(?:^|\.)chunkId$/i.test(bp)&&parcel.chunkId!=null&&sameValue(bv,parcel.chunkId))rp='chunkId';
    if(!rp&&/(?:listing|offer).*(?:id|ref)$/i.test(bp))rp=Object.keys(flatParcel).find(k=>/(?:listing|offer).*(?:id|ref)$/i.test(k)&&sameValue(flatParcel[k],bv))||null;
    if(!rp&&/(?:parcel|land|chunk|listing|offer|price|value|area|lat|lon|lng|centroid)/i.test(bp))rp=Object.keys(flatParcel).find(k=>sameValue(flatParcel[k],bv)&&/(?:ref|id|chunk|listing|price|value|area|lat|lon|lng)/i.test(k))||null;
    if(rp)mapping[bp]=rp;
  }
  const u=urlTemplateFromObservation(url,parcel),mappedIdentity=Object.keys(mapping).some(p=>/(?:parcel|land|ref|id)/i.test(p)),urlIdentity=Object.values(u.urlMap||{}).some(p=>p==='ref'||/(?:parcel|land).*(?:id|ref)/i.test(p));
  if(!mappedIdentity&&!urlIdentity)return null;
  const unresolvedParcelIdentity=Object.keys(flatBody).filter(p=>/(?:^|\.)(?:parcelId|landId|parcelRef|landRef|listingId)$/i.test(p)&&!mapping[p]);
  if(unresolvedParcelIdentity.length||Object.keys(flatBody).some(p=>/(?:price|amount|cost|listingId|offerId)$/i.test(p)&&!mapping[p]&&!/(?:account|company|player)/i.test(p)))return null;
  return{learnedAt:Date.now(),urlTemplate:u.urlTemplate,urlMap:u.urlMap,method:String(obs.method).toUpperCase(),baseBody:hadBody?body:null,mapping,accountId:learning.accountId,scope:learning.scope,learnedFromRef:ref};
}
async function captureLandLearning(obs){
  if(!['request','response'].includes(obs.kind))return;
  const s=await chrome.storage.local.get([LAND_BUY_LEARN_KEY,PARCEL_INTEL_KEY]),learning=s[LAND_BUY_LEARN_KEY];
  if(!learning?.active)return;
  if(Date.now()-num(learning.startedAt)>5*60000){await chrome.storage.local.set({[LAND_BUY_LEARN_KEY]:{...learning,active:false,status:'expired',lastError:'No successful CapitalRift land purchase was observed within five minutes. Start learning again.'}});return;}
  if(obs.kind==='request'){
    if(!['POST','PUT','PATCH'].includes(String(obs.method||'').toUpperCase()))return;
    const rows=s[PARCEL_INTEL_KEY]||{};
    const parcel=Object.values(rows).find(p=>globalThis.CRCCLandBuyer?.candidate({...p,ref:p.id,entityType:'land',source:'observed-game-land'})&&landRequestHasAlias(obs.url,obs.body,p.id));
    if(!parcel)return;
    if(parcel.myOwned||landOwnedBy(parcel,learning.scope,learning.accountId)){
      await chrome.storage.local.set({[LAND_BUY_LEARN_KEY]:{...learning,status:'waiting',lastError:'This parcel is already yours. Buy an unowned parcel normally while learning.'}});return;
    }
    const normalized=landPurchaseRow(parcel),template=deriveLandBuyTemplate(obs,{...learning,parcel:normalized});if(!template)return;
    await chrome.storage.local.set({[LAND_BUY_LEARN_KEY]:{...learning,status:'verifying',lastError:null,pending:{url:obs.url,method:obs.method,ref:normalized.ref,template,at:Date.now()}}});return;
  }
  const pending=learning.pending;
  if(!pending||obs.url!==pending.url||obs.method!==pending.method||Date.now()-pending.at>30000)return;
  const success=obs.status>=200&&obs.status<300&&obs.data?.ok!==false&&obs.data?.success!==false&&!obs.data?.error;
  if(!success){await chrome.storage.local.set({[LAND_BUY_LEARN_KEY]:{...learning,status:'waiting',pending:null,lastError:'The game did not confirm that purchase. Open an unowned purchasable parcel and buy it normally.'}});return;}
  await chrome.storage.local.set({[LAND_BUY_TEMPLATE_KEY]:pending.template,[LAND_BUY_LEARN_KEY]:{active:false,status:'learned',scope:learning.scope,accountId:learning.accountId,learnedAt:Date.now(),learnedFromRef:pending.ref,method:pending.method,parcelField:Object.keys(pending.template.mapping).find(p=>/(?:parcel|land|ref|id)/i.test(p))||'URL'}});
  const purchased=findLandRow(s[PARCEL_INTEL_KEY],pending.ref);if(purchased)await markLandPurchased(landPurchaseRow(purchased),learning.scope,learning.accountId,null);
}
async function beginLandBuyLearning(msg){
  const scope=msg.scope,accountId=msg.accountId,parcel=msg.parcel;if(!accountId||!['company','character'].includes(scope))throw Error('Select the account that will buy the land.');
  const active=activeAccountFromMe(await gameGet('/me'));if(active.uncertain||active.scope!==scope||String(active.id)!==String(accountId))throw Error(scope==='company'?'Pilot the matching company before learning land purchase.':'Switch CapitalRift to the matching character before learning land purchase.');
  if(parcel&&!globalThis.CRCCLandBuyer?.candidate(parcel))throw Error('Choose a confirmed CapitalRift parcel, or start learning without selecting one.');
  if(parcel&&(parcel.myOwned||landOwnedBy(parcel,scope,accountId)))throw Error('This land is already yours. Open an unowned parcel to teach a purchase.');
  const learning={active:true,startedAt:Date.now(),scope,accountId,preferredRef:parcel?.ref??null,status:'waiting',lastError:null};
  await chrome.storage.local.set({[LAND_BUY_LEARN_KEY]:learning});return learning;
}
function landPurchaseRow(row){if(!row?.id)return null;const ref=String(row.id),bare=ref.replace(/^parcel\//i,'');return{ref,id:bare,parcelId:bare,landId:bare,entityType:'land',source:'observed-game-land',chunkId:row.chunkId??null,areaM2:row.areaM2??null,busyness:row.busyness??null,value:row.value??null,purchasePrice:finite(row.listing?.price)?Number(row.listing.price):finite(row.purchasePrice)?Number(row.purchasePrice):null,listing:row.listing??null,owner:row.owner??null,myOwned:row.myOwned===true,observedAt:row.observedAt??null,lat:row.lat??null,lon:row.lon??null};}
function landEligibility(row,scope,accountId){const p=landPurchaseRow(row);if(!p)return{eligible:false,reason:'missing-parcel'};if(p.myOwned||landOwnedBy(p,scope,accountId))return{eligible:false,reason:'already-owned',parcel:p};const check=globalThis.CRCCLandBuyer?.eligibility(p);if(check?.state!=='purchasable')return{eligible:false,reason:check?.state||'needs-details',parcel:p};if(!finite(p.observedAt)||Date.now()-Number(p.observedAt)>5*60*1000)return{eligible:false,reason:'stale-parcel-data',parcel:p};const price=globalThis.CRCCLandBuyer.price(p);return{eligible:true,parcel:p,price:Number(price)};}
// /api/world is the land read request observed in CapitalRift's own map.
// A response may omit sale details: keep those parcels unresolved rather than
// treating an appraisal or an unknown owner as an offer.
async function resolveLandParcels(refs){
  const s=await chrome.storage.local.get(PARCEL_INTEL_KEY),rows=s[PARCEL_INTEL_KEY]||{},chosen=[...new Set(arr(refs).map(String))].slice(0,250),chunks=[...new Set(chosen.map(ref=>findLandRow(rows,ref)?.chunkId).filter(id=>scoutTileBounds(id)))].slice(0,12);
  if(!chunks.length)return{chunksRequested:0,updated:0,needsManualInspection:chosen.length};
  const res=await fetch(API+'/world',{method:'POST',credentials:'include',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({parts:[{layer:'land',chunks}]})});
  if(!res.ok)throw Error(`CapitalRift land details HTTP ${res.status}`);
  const data=await res.json(),observed=extractScoutParcels(data);if(observed.length)await storeObservation({kind:'response',method:'POST',url:API+'/world',status:200,data,ts:Date.now()});
  const latest=(await chrome.storage.local.get(PARCEL_INTEL_KEY))[PARCEL_INTEL_KEY]||{};
  const liveOffers={},resolvedRefs=chosen.filter(ref=>observed.some(p=>landRefAliases(ref).includes(String(p.id))));for(const ref of chosen){const p=observed.find(row=>landRefAliases(ref).includes(String(row.id)));if(p&&globalThis.CRCCLandBuyer.eligibility({...p,ref:p.id,entityType:'land',source:'observed-game-land'}).state==='purchasable')liveOffers[ref]={listing:p.listing,purchasePrice:p.purchasePrice,owner:p.owner};}
  // Reuse only a read URL actually observed on a CapitalRift parcel panel.
  // Map chunks generally expose appraised value without the purchase offer.
  const source=Object.values(latest).find(p=>p.detailUrl&&landRequestHasAlias(p.detailUrl,null,p.id));let detailChecks=0;
  if(source)for(const ref of chosen){if(!resolvedRefs.includes(ref)||liveOffers[ref]||detailChecks>=12)continue;
    const url=landDetailUrlFor(ref,source.detailUrl,source.id);if(!url)continue;detailChecks++;
    try{const detailResponse=await fetch(url,{credentials:'include',headers:{Accept:'application/json'}});if(!detailResponse.ok)continue;
      const payload=await detailResponse.json(),detail=payload?.parcel??payload?.land??payload;
      if(!landRefAliases(ref).includes(String(detail?.parcelId??detail?.landId??detail?.ref??detail?.id)))continue;
      await observeLandDetail({kind:'response',method:'GET',url,status:detailResponse.status,data:payload,ts:Date.now()});
      const row=findLandRow((await chrome.storage.local.get(PARCEL_INTEL_KEY))[PARCEL_INTEL_KEY],ref),explicitOffer='listing' in detail||'purchaseOffer' in detail||'saleOffer' in detail||detail.canBuy===true||detail.canPurchase===true||detail.forSale===true;
      const freshPrice=pick(detail,['purchasePrice','salePrice','askingPrice'],null),freshListing=explicitOffer?row?.listing:null;
      if(row&&explicitOffer&&globalThis.CRCCLandBuyer.eligibility({...landPurchaseRow(row),listing:freshListing,purchasePrice:finite(freshPrice)?Number(freshPrice):null}).state==='purchasable')liveOffers[ref]={listing:freshListing,purchasePrice:finite(freshPrice)?Number(freshPrice):null,owner:row.owner};
    }catch(_){} // Leave unresolved; never turn a failed detail request into a purchase offer.
  }
  const refreshed=(await chrome.storage.local.get(PARCEL_INTEL_KEY))[PARCEL_INTEL_KEY]||{};
  return{chunksRequested:chunks.length,updated:observed.length+detailChecks,resolvedRefs,liveOffers,needsManualInspection:chosen.filter(ref=>globalThis.CRCCLandBuyer.eligibility(landPurchaseRow(findLandRow(refreshed,ref))).state==='needs-details').length};
}
function buildLandBuyUrl(t,parcel){let url=String(t.urlTemplate||'');for(const[token,path]of Object.entries(t.urlMap||{})){let v=getPath(parcel,path);if(path==='ref'&&v==null)v=parcel.ref;if(v!==undefined&&v!==null)url=url.split(token).join(encodeURIComponent(String(v)));}if(!url.startsWith(API+'/')||url.includes('__CRCC_'))throw Error('The learned land purchase URL cannot be safely mapped to this parcel.');return url;}
function buildLandBuyBody(t,parcel){if(t.baseBody==null){if(Object.keys(t.mapping||{}).length)throw Error('The learned land purchase body is missing.');return null;}const body=cloneJson(t.baseBody);for(const[bp,rp]of Object.entries(t.mapping||{})){let v=getPath(parcel,rp);if(rp==='ref'&&v==null)v=parcel.ref;if(v===undefined||v===null)throw Error(`Missing parcel field required by the learned purchase request: ${rp}`);setPath(body,bp,v);}return body;}
function validateLandBuyTemplate(t){if(!t||!['POST','PUT','PATCH'].includes(t.method)||!String(t.urlTemplate||'').startsWith(API+'/'))return false;
  const identity=Object.keys(t.mapping||{}).some(p=>/(?:parcel|land|ref|id)/i.test(p))||Object.values(t.urlMap||{}).some(p=>p==='ref'||/(?:parcel|land).*(?:id|ref)/i.test(p));
  return identity&&!Object.keys(flatten(t.baseBody||{})).some(p=>/(?:^|\.)(?:parcelId|landId|parcelRef|landRef|listingId|offerId|price|amount|cost)$/i.test(p)&&!t.mapping?.[p]);}
async function markLandPurchased(parcel,scope,accountId,paidPrice){const s=await chrome.storage.local.get(PARCEL_INTEL_KEY),all={...(s[PARCEL_INTEL_KEY]||{})},ref=String(parcel.ref),old=all[ref]||{};all[ref]={...old,...parcel,id:ref,myOwned:true,owner:{id:accountId,kind:scope==='character'?'player':'company',playerId:scope==='character'?accountId:null,companyId:scope==='company'?accountId:null,name:'Current account'},listing:null,lastPurchasePrice:finite(paidPrice)?Number(paidPrice):null,purchasedAt:Date.now(),observedAt:Date.now()};await chrome.storage.local.set({[PARCEL_INTEL_KEY]:all});scoutDataRevision++;viewportSurveyCache.clear();}
async function writeLandBuySession(session){session.updatedAt=Date.now();await chrome.storage.local.set({[LAND_BUY_SESSION_KEY]:trimRow(session)});}
async function performLandPurchase(t,parcel){const url=buildLandBuyUrl(t,parcel),body=buildLandBuyBody(t,parcel),init={method:t.method,credentials:'include',headers:{Accept:'application/json'}};if(body!=null){init.headers['Content-Type']='application/json';init.body=JSON.stringify(body);}let res;try{res=await fetch(url,init);}catch(e){return{ok:false,kind:'fail',reason:e?.message||'network-error'};}const raw=await res.text();let data=null;try{data=raw?JSON.parse(raw):null;}catch(_){}
  if(!res.ok){const message=(raw||`HTTP ${res.status}`).slice(0,240),lower=message.toLowerCase();if(res.status===401||res.status===403||res.status===429||/insufficient|not enough.*(?:cash|funds|money)|session|unauth|rate.?limit/.test(lower))return{ok:false,kind:'global',reason:`HTTP ${res.status}: ${message}`};if(res.status===404||res.status===409||/sold|already.*owned|not.*available|not.*for sale|unavailable/.test(lower))return{ok:false,kind:'skip',reason:`HTTP ${res.status}: ${message}`};return{ok:false,kind:'fail',reason:`HTTP ${res.status}: ${message}`};}
  if(data?.ok===false||data?.success===false||data?.error)return{ok:false,kind:'fail',reason:String(data.error||data.message||'CapitalRift did not confirm this purchase.').slice(0,240)};
  const charged=findDeep(data||{},['purchasePrice','paidPrice','price','cost','amount'],4);return{ok:true,charged:finite(charged)?Math.abs(Number(charged)):null,data};
}
async function runLandBuyBatch(msg){
  if(activeLandBuySession)throw Error('A mass land purchase is already running.');if(msg.confirmed!==true)throw Error('Mass land purchase requires explicit confirmation.');
  const scope=msg.scope,accountId=msg.accountId;if(!accountId||!['company','character'].includes(scope))throw Error('Select the purchasing account.');
  const s=await chrome.storage.local.get([LAND_BUY_TEMPLATE_KEY,PARCEL_INTEL_KEY]),t=s[LAND_BUY_TEMPLATE_KEY];if(!t)throw Error('Learn the official CapitalRift land purchase request first.');if(!validateLandBuyTemplate(t))throw Error('The learned land purchase action is incomplete. Relearn Purchase Action with a normal game purchase.');if(String(t.accountId)!==String(accountId)||t.scope!==scope)throw Error('Learn land purchase separately for this account.');
  const active=activeAccountFromMe(await gameGet('/me'));if(active.uncertain||active.scope!==scope||String(active.id)!==String(accountId))throw Error(scope==='company'?'Pilot the matching company before mass buying land.':'Switch to the matching character before mass buying land.');
  let liveGame=null;try{liveGame=await gameGet(`/game/${encodeURIComponent(accountId)}`);}catch(_){}const cash=finite(liveGame?.cash)?Number(liveGame.cash):null;
  const plannedRows=[],plannedSeen=new Set();for(const x of arr(msg.parcels)){const ref=String(x?.ref||'');if(!ref||plannedSeen.has(ref))continue;plannedSeen.add(ref);plannedRows.push(x);if(plannedRows.length>=500)break;}const requested=plannedRows.map(x=>String(x.ref));if(!requested.length)throw Error('No land parcels were selected.');
  const maxParcels=Math.max(1,Math.min(500,Math.floor(num(msg.maxParcels,requested.length)||requested.length))),userBudget=finite(msg.maxSpend)?Math.max(0,Number(msg.maxSpend)):null,effectiveBudget=cash!=null?(userBudget==null?cash:Math.min(cash,userBudget)):userBudget,tolerance=Math.max(0,Math.min(25,num(msg.priceTolerancePct,0)));
  const id=`land-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,session={id,status:'running',scope,accountId,total:Math.min(requested.length,maxParcels),requested:requested.length,completed:0,purchased:0,skipped:0,failed:0,spent:0,areaAcquired:0,startingCash:cash,maxSpend:effectiveBudget,priceTolerancePct:tolerance,currentRef:null,stopRequested:false,error:null,startedAt:Date.now(),items:[]};activeLandBuySession={id,stopRequested:false};await writeLandBuySession(session);
  try{for(const planned of plannedRows.slice(0,maxParcels)){
      if(activeLandBuySession?.id!==id||activeLandBuySession.stopRequested){session.status='stopped';session.stopRequested=true;break;}const ref=String(planned.ref);session.currentRef=ref;
      let verification;try{verification=await resolveLandParcels([ref]);}catch(e){session.error=`Live land check failed: ${e.message}`;session.status='failed';await writeLandBuySession(session);break;}
      const latest=findLandRow((await chrome.storage.local.get(PARCEL_INTEL_KEY))[PARCEL_INTEL_KEY],ref),offer=verification.liveOffers?.[ref],check=offer?landEligibility({...latest,listing:offer.listing,purchasePrice:offer.purchasePrice,owner:offer.owner,observedAt:Date.now()},scope,accountId):{eligible:false,reason:verification.resolvedRefs?.includes(ref)?'no-current-sale-offer':'no-current-game-detail'};
      if(!check.eligible){session.skipped++;session.completed++;session.items.push({ref,status:'skipped',reason:check.reason});await writeLandBuySession(session);continue;}
      const livePrice=check.price,selectedPrice=finite(planned.selectedPrice)?Number(planned.selectedPrice):finite(planned.purchasePrice)?Number(planned.purchasePrice):null;if(selectedPrice!=null&&livePrice>selectedPrice*(1+tolerance/100)+1e-9){session.skipped++;session.completed++;session.items.push({ref,status:'skipped',reason:'price-changed',selectedPrice,livePrice});await writeLandBuySession(session);continue;}
      if(effectiveBudget!=null&&session.spent+livePrice>effectiveBudget+1e-9){session.skipped++;session.completed++;session.items.push({ref,status:'skipped',reason:'budget',price:livePrice});await writeLandBuySession(session);continue;}
      try{buildLandBuyUrl(t,check.parcel);buildLandBuyBody(t,check.parcel);}catch(e){session.skipped++;session.completed++;session.items.push({ref,status:'skipped',reason:`Learned action cannot map this parcel: ${e.message}`});await writeLandBuySession(session);continue;}
      session.items.push({ref,status:'buying',price:livePrice});await writeLandBuySession(session);const result=await performLandPurchase(t,check.parcel);const item=session.items.at(-1);
      if(result.ok){const charged=finite(result.charged)?Number(result.charged):livePrice;item.status='purchased';item.price=charged;session.purchased++;session.spent+=charged;session.areaAcquired+=num(check.parcel.areaM2);await markLandPurchased(check.parcel,scope,accountId,charged);}else if(result.kind==='skip'){item.status='skipped';item.reason=result.reason;session.skipped++;}else{item.status='failed';item.reason=result.reason;session.failed++;if(result.kind==='global'){session.error=result.reason;session.status='failed';session.completed++;await writeLandBuySession(session);break;}}
      session.completed++;await writeLandBuySession(session);if(session.status==='failed')break;await sleep(300);
    }
    if(session.status==='running')session.status=session.stopRequested?'stopped':'completed';session.currentRef=null;session.finishedAt=Date.now();await writeLandBuySession(session);
    const hs=await chrome.storage.local.get(LAND_BUY_HISTORY_KEY),history=arr(hs[LAND_BUY_HISTORY_KEY]);history.unshift({id:session.id,status:session.status,scope,accountId,purchased:session.purchased,skipped:session.skipped,failed:session.failed,spent:session.spent,areaAcquired:session.areaAcquired,startedAt:session.startedAt,finishedAt:session.finishedAt});await chrome.storage.local.set({[LAND_BUY_HISTORY_KEY]:history.slice(0,30)});return session;
  }finally{if(activeLandBuySession?.id===id)activeLandBuySession=null;}
}
async function stopLandBuy(){if(!activeLandBuySession)return false;activeLandBuySession.stopRequested=true;const s=await chrome.storage.local.get(LAND_BUY_SESSION_KEY),session=s[LAND_BUY_SESSION_KEY];if(session?.id===activeLandBuySession.id){session.stopRequested=true;await writeLandBuySession(session);}return true;}
function deriveBuildingRenameTemplate(obs,learning){if(!learning?.active||Date.now()-learning.startedAt>5*60000||!['POST','PUT','PATCH'].includes(obs.method))return null;
  const ref=String(learning.ref),flat=flatten(obs.body||{}),namePaths=Object.keys(flat).filter(p=>String(flat[p])===learning.marker),refPath=Object.keys(flat).find(p=>/(?:^|\.)(?:ref|buildingRef|propertyRef|buildingId|propertyId)$/i.test(p)&&String(flat[p])===ref),url=String(obs.url||''),urlHasRef=url.includes(ref)||url.includes(encodeURIComponent(ref));
  if(namePaths.length!==1||!refPath&&!urlHasRef||!/building|property|rename/i.test(url))return null;
  const token='__CRCC_BUILDING_REF__',urlTemplate=urlHasRef?url.replaceAll(encodeURIComponent(ref),token).replaceAll(ref,token):url;
  const source=learning.asset||{},chunk=source.chunkId!=null?String(source.chunkId):null,chunkPaths=Object.keys(flat).filter(p=>/(?:^|\.)chunkId$/i.test(p)&&chunk&&String(flat[p])===chunk);
  // If the request names a chunk, it must be remapped to each building's own
  // chunk. Otherwise reusing the learned request could target the wrong deed.
  if(Object.keys(flat).some(p=>/(?:^|\.)chunkId$/i.test(p))&&!chunkPaths.length)return null;
  const chunkToken='__CRCC_BUILDING_CHUNK__',chunkInUrl=!!chunk&&(urlTemplate.includes(encodeURIComponent(chunk))||urlTemplate.includes(chunk));
  const extraIdentity=Object.keys(flat).some(p=>/(?:^|\.)(?:\w*(?:Id|Key|Ref))$/i.test(p)&&p!==refPath&&!chunkPaths.includes(p)&&!['accountId','companyId','playerId','ownerId'].includes(p.split('.').at(-1)));
  // Keep the official request fields, but replace its observed building ID on every call.
  return{urlTemplate:chunkInUrl?urlTemplate.replaceAll(encodeURIComponent(chunk),chunkToken).replaceAll(chunk,chunkToken):urlTemplate,refPath:refPath||null,chunkPaths,chunkInUrl,boundRef:extraIdentity?ref:null,namePath:namePaths[0],baseBody:obs.body,method:obs.method,accountId:learning.accountId,scope:learning.scope,learnedAt:Date.now()};
}
let observationWrites=Promise.resolve();
let landLearningWrites=Promise.resolve();
async function handleObservation(obs){if(!obs||typeof obs!=='object')return;const url=String(obs.url||'');if(!url.startsWith(API+'/'))return;
  if((obs.kind==='request'||obs.kind==='response')&&obs.method!=='GET'&&(/(?:land|parcel|buy|purchase)/i.test(url)||obs.kind==='response'||/(?:buy|purchase|acquire)[_-]?(?:land|parcel)/i.test(JSON.stringify(obs.body?.action??obs.body?.operation??''))))await(landLearningWrites=landLearningWrites.catch(()=>{}).then(()=>captureLandLearning(obs)));
  if(obs.kind==='response')await (observationWrites=observationWrites.catch(()=>{}).then(async()=>{await storeObservation(obs);await observeLandDetail(obs);}));
  if(obs.kind==='request'&&obs.method&&obs.method!=='GET'){await capturePurchaseRequest(obs).catch(()=>{});
  const s=await chrome.storage.local.get([LEARN_KEY,BUILDING_LEARN_KEY]),learning=s[LEARN_KEY],building=s[BUILDING_LEARN_KEY];
  if(building?.active&&JSON.stringify(obs.body??'').includes(building.marker)){const t=deriveBuildingRenameTemplate(obs,building);if(t)await chrome.storage.local.set({[BUILDING_RENAME_KEY]:t,[BUILDING_LEARN_KEY]:{...building,active:false,learnedAt:Date.now()}});}
  if(!learning?.active||!JSON.stringify(obs.body??'').includes(learning.marker))return;const t=deriveRenameTemplate(obs,learning);if(t)await chrome.storage.local.set({[RENAME_KEY]:t,[LEARN_KEY]:{...learning,active:false,learnedAt:Date.now()}});}}
function buildRenameUrl(t,shop){let url=t.urlTemplate||t.url;for(const[token,path]of Object.entries(t.urlMap||{})){const v=getPath(shop,path);if(v!==undefined)url=url.split(token).join(encodeURIComponent(String(v)));}return url;}
async function performRename(shop,newName,scope,accountId){newName=text(newName).trim();if(!newName||newName.length>120)throw new Error('Shop name must be 1–120 characters.');const current=text(pick(shop,['name','shopName','storeName','title','label'],''));if(current===newName)return{ok:true,skipped:true};if(!accountId||!['company','character'].includes(scope))throw Error('Choose the current account before renaming.');const active=activeAccountFromMe(await gameGet('/me'));if(active.uncertain||active.scope!==scope||String(active.id)!==String(accountId))throw Error('Switch CapitalRift to the matching account before renaming.');const s=await chrome.storage.local.get([RENAME_KEY,KEY]),t=s[RENAME_KEY],rows=arr(s[KEY]?.accounts?.[scope]?.income?.sources?.shops?.rows);if(String(s[KEY]?.accounts?.[scope]?.id)!==String(accountId)||!rows.some(r=>String(r?.id??r?.shopId??r?.unitKey)===String(shop?.id??shop?.shopId??shop?.unitKey)))throw Error('Shop is not confirmed in the selected account.');if(!t?.namePath||!['POST','PATCH','PUT'].includes(t.method))throw new Error('Rename method has not been learned yet.');const url=buildRenameUrl(t,shop);if(!String(url).startsWith(API+'/'))throw new Error('Blocked rename URL.');const body=cloneJson(t.baseBody||{});setPath(body,t.namePath,newName);for(const[bp,rp]of Object.entries(t.mapping||{})){const v=getPath(shop,rp);if(v!==undefined)setPath(body,bp,v);}const res=await fetch(url,{method:t.method,credentials:'include',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body)}),responseText=await res.text();if(!res.ok)throw new Error(`Rename HTTP ${res.status}${responseText?`: ${responseText.slice(0,220)}`:''}`);return{ok:true,skipped:false};}
async function beginRenameLearning(msg){
  const scope=msg.scope,accountId=msg.accountId;
  if(!accountId||!['company','character'].includes(scope))throw Error('Select an account before learning shop rename.');
  const me=await gameGet('/me'),active=activeAccountFromMe(me);
  if(active.uncertain||active.scope!==scope||String(active.id)!==String(accountId))throw Error('Switch CapitalRift to the selected account, then try again.');
  const snapshot=(await chrome.storage.local.get(KEY))[KEY],account=snapshot?.accounts?.[scope],fields=['shopId','storeId','businessKey','unitKey','id'];
  const matches=arr(account?.income?.sources?.shops?.rows).filter(row=>fields.some(k=>row?.[k]!=null&&msg.shop?.[k]!=null&&String(row[k])===String(msg.shop[k])));
  if(String(account?.id)!==String(accountId)||matches.length!==1)throw Error('The open shop was not confirmed uniquely in this account. Refresh and try again.');
  const marker=`CRCC_LEARN_${Date.now().toString(36).toUpperCase()}`,learning={active:true,startedAt:Date.now(),marker,shop:msg.shop,oldName:msg.oldName||null,scope,accountId};
  await chrome.storage.local.set({[LEARN_KEY]:learning});return learning;
}
async function performBuildingRename(scope,accountId,ref,newName){ref=String(ref||'');newName=text(newName).trim();if(!ref||!newName||newName.length>120)throw Error('Enter a valid building name (1–120 characters).');
  const s=await chrome.storage.local.get([KEY,BUILDING_RENAME_KEY]),t=s[BUILDING_RENAME_KEY];if(!ownedBuilding(s[KEY],scope,accountId,ref))throw Error('This building is not confirmed in the selected account Assets menu. Refresh the account.');
  if(!t?.namePath||!['POST','PUT','PATCH'].includes(t.method)||!t.refPath&&!t.urlTemplate?.includes('__CRCC_BUILDING_REF__'))throw Error('Learn the official building rename request first.');
  if(t.accountId!=null&&(String(t.accountId)!==String(accountId)||t.scope!==scope))throw Error('Learn building rename separately for this account.');
  if(t.boundRef&&String(t.boundRef)!==ref)throw Error('This game rename request has additional identifiers; learn it on this building first.');
  const me=await gameGet('/me'),active=activeAccountFromMe(me);
  if(active.uncertain||String(active.id)!==String(accountId)||active.scope!==scope)throw Error('Switch to the matching account in CapitalRift before renaming.');
  const game=await gameGet(`/game/${encodeURIComponent(accountId)}`),deed=extractOfficialAssetInventory(game).buildings.find(b=>String(b.ref)===ref);if(!deed)throw Error('CapitalRift did not confirm current building ownership; refresh Assets and try again.');
  const current=arr(game?.assets).find(a=>String(propertyRefOf(a)||a?.ref)===ref),fallback=arr(game?.ownedBuildings).find(a=>String(propertyRefOf(a)||a?.ref)===ref);
  if([current?.label,current?.name,fallback?.label,fallback?.name].includes(newName))return{ok:true,skipped:true};
  const chunk=deed.raw?.chunkId;if((t.chunkPaths?.length||t.chunkInUrl)&&chunk==null)throw Error('This building has no verified chunk ID for the learned rename request.');
  const url=String(t.urlTemplate).replaceAll('__CRCC_BUILDING_REF__',encodeURIComponent(ref)).replaceAll('__CRCC_BUILDING_CHUNK__',encodeURIComponent(String(chunk||'')));if(!url.startsWith(API+'/')||url.includes('__CRCC_'))throw Error('Blocked building rename URL.');
  const body=cloneJson(t.baseBody);setPath(body,t.namePath,newName);if(t.refPath)setPath(body,t.refPath,ref);for(const p of t.chunkPaths||[])setPath(body,p,chunk);
  const res=await fetch(url,{method:t.method,credentials:'include',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body)});if(!res.ok)throw Error(`Building rename HTTP ${res.status}: ${(await res.text()).slice(0,150)}`);return{ok:true,skipped:false};
}

async function verifiedReadAccount(scope,accountId){
  if(!['company','character'].includes(scope)||!accountId)throw Error('Select the active Capital Rift account.');
  const active=activeAccountFromMe(await gameGet('/me'));
  if(active.uncertain||active.scope!==scope||String(active.id)!==String(accountId))throw Error('Switch Capital Rift to the matching account before requesting fresh data.');
  const snapshot=(await chrome.storage.local.get(KEY))[KEY],account=snapshot?.accounts?.[scope];
  if(String(account?.id)!==String(active.id))throw Error('Refresh the selected account before requesting fresh data.');
  return{account,id:active.id};
}
async function loadRegionInfo(scope,accountId,lon,lat){
  if(!validCoord(lat,lon))throw Error('Select a property with a valid Capital Rift location.');
  const {id}=await verifiedReadAccount(scope,accountId);
  // Exact previously requested locations can reuse their areaId-keyed observation.
  // Different points need a game lookup because coordinates alone cannot prove area membership.
  const stored=await chrome.storage.local.get(REGION_INFO_KEY),cached=Object.entries(stored[REGION_INFO_KEY]||{}).filter(([key,r])=>key.startsWith(id+':')&&r?.lon!=null&&r?.lat!=null&&Math.abs(Number(r.lon)-Number(lon))<1e-7&&Math.abs(Number(r.lat)-Number(lat))<1e-7&&Date.now()-Number(r.observedAt)<120000).sort((a,b)=>b[1].observedAt-a[1].observedAt)[0]?.[1];
  if(cached)return cached;
  const url=`/game/${encodeURIComponent(id)}/region-info/at?lon=${encodeURIComponent(String(Number(lon)))}&lat=${encodeURIComponent(String(Number(lat)))}`;
  const data=await gameGet(url),region=CRCCRegionData.region(data,Date.now());
  if(!region)throw Error('Capital Rift did not return structured Region Info for this location.');
  await storeObservation({kind:'response',method:'GET',status:200,url:API+url,data,ts:region.observedAt});return region;
}
async function loadShopHistory(accountId,shopId,scope){
  if(!accountId||!shopId)throw Error('Choose a shop with a stable game ID.');
  const {account,id}=await verifiedReadAccount(scope,accountId);
  if(!account||!arr(account.income?.sources?.shops?.rows).some(r=>String(r.id??r.shopId)===String(shopId)))throw Error('Shop is not in this account feed.');
  const url=`/game/${encodeURIComponent(id)}/shop-history?shopId=${encodeURIComponent(shopId)}`;
  const data=await gameGet(url),history=CRCCRegionData.history(data,Date.now());
  if(!history||history.shopId!==String(shopId))throw Error('Capital Rift did not return history for the selected shop.');
  await storeObservation({kind:'response',method:'GET',status:200,url:API+url,data,ts:history.observedAt});return history;
}

async function socialRead(path){if(!/^\/social\/(?:summary|channels\/[^/?#]+\/(?:messages|posts)|posts\/[^/?#]+)(?:[?#]|$)/.test(path))throw Error('Unsupported social read.');const response=await fetch(API+path,{method:'GET',credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});if(!response.ok)throw Error('Social read HTTP '+response.status);return response.json();}
async function socialSummary(){const data=await socialRead('/social/summary'),channels=CRCCChatIntel.channels(data);const old=(await chrome.storage.local.get(CHAT_INTEL_KEY))[CHAT_INTEL_KEY]||{},next={...old,channels};await chrome.storage.local.set({[CHAT_INTEL_KEY]:next});return next;}
async function socialScan(key,options={}){if(!CRCCChatIntel.KEYS.includes(key))throw Error('Only selected public/system channels are supported.');const current=await socialSummary(),channel=current.channels.find(c=>c.key===key);if(!channel)throw Error('This public channel is not available in Capital Rift.');
  const result=await CRCCChatIntel.scan(channel,socialRead,{pages:options.pages,before:options.before,tag:options.tag,status:options.status,sort:options.sort});
  const existing=(await chrome.storage.local.get(CHAT_INTEL_KEY))[CHAT_INTEL_KEY]||current;
  const rows=CRCCChatIntel.merge(existing.rows||[],result.rows),next={...existing,channels:current.channels,rows,at:Date.now(),pagesFetched:result.pagesFetched,cursors:{...existing.cursors,[key]:result.before}};
  await chrome.storage.local.set({[CHAT_INTEL_KEY]:next});return next;}
async function socialPostDetails(key,id){if(!['bug-reports','suggestions'].includes(key)||!id)throw Error('Select a public forum post.');const channels=CRCCChatIntel.channels(await socialRead('/social/summary'));if(!channels.some(c=>c.key===key&&c.kind==='system_forum'))throw Error('Forum is unavailable.');return socialRead('/social/posts/'+encodeURIComponent(id));}
async function socialViewed(id){const s=(await chrome.storage.local.get(CHAT_INTEL_KEY))[CHAT_INTEL_KEY]||{};const next={...s,announcementViewedId:String(id||'')};await chrome.storage.local.set({[CHAT_INTEL_KEY]:next});return next;}

// ---- 5-minute automatic refresh ----
async function maybeAutoRefresh(){try{const tabs=await chrome.tabs.query({url:GAME_ORIGIN+'/*'});if(!tabs.length)return;await refreshData();}catch(_){} }
chrome.runtime.onInstalled.addListener(()=>chrome.alarms.create('crcc-five-minute-refresh',{periodInMinutes:5}));
chrome.runtime.onStartup.addListener(()=>chrome.alarms.create('crcc-five-minute-refresh',{periodInMinutes:5}));
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='crcc-five-minute-refresh')maybeAutoRefresh();});
chrome.alarms.create('crcc-five-minute-refresh',{periodInMinutes:5});

chrome.action.onClicked.addListener(async tab=>{let target=tab;if(!target?.id||!String(target.url||'').startsWith(GAME_ORIGIN+'/')){const tabs=await chrome.tabs.query({url:GAME_ORIGIN+'/*'});target=tabs[0];if(target?.id)await chrome.tabs.update(target.id,{active:true});}if(target?.id)chrome.tabs.sendMessage(target.id,{kind:'togglePanel'}).catch(()=>{});});
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  if(!msg||typeof msg!=='object')return;
  if(msg.kind==='refresh'){refreshData().then(data=>respond({ok:true,data})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='get'){chrome.storage.local.get([KEY,HISTORY_KEY,HOURLY_KEY,RENAME_KEY,LEARN_KEY,BUILDING_RENAME_KEY,BUILDING_LEARN_KEY,GROSS_REBASE_KEY,'crcc_gross_ids_v1',GEO_KEY,PLAYER_TRACK_KEY,HEALTH_KEY,SHOP_STOCK_KEY,MARKET_KEY,IPO_KEY,RENT_MARKET_KEY,REGION_INTEL_KEY,REGION_INFO_KEY,SHOP_HISTORY_KEY,BUILDING_INTEL_KEY,UNIT_INTEL_KEY,NAV_KEY,NAV_ANCHOR_KEY,WATCH_KEY,MARKET_SCAN_KEY,MARKET_SCAN_PROGRESS_KEY,PROPERTY_BUYERS_KEY,LAND_BUY_TEMPLATE_KEY,LAND_BUY_LEARN_KEY,LAND_BUY_SESSION_KEY,LAND_BUY_HISTORY_KEY,OSM_REF_KEY]).then(s=>respond({ok:true,data:s[KEY]||null,history:s[HISTORY_KEY]||[],hourly:s[HOURLY_KEY]||[],renameTemplate:s[RENAME_KEY]||null,renameLearning:s[LEARN_KEY]||null,buildingRenameTemplate:s[BUILDING_RENAME_KEY]||null,buildingRenameLearning:s[BUILDING_LEARN_KEY]||null,grossRebases:s[GROSS_REBASE_KEY]||{},grossIds:s.crcc_gross_ids_v1||{},geo:s[GEO_KEY]||{},playerTrack:s[PLAYER_TRACK_KEY]||{},shopHealth:s[HEALTH_KEY]||{},shopStock:s[SHOP_STOCK_KEY]||{},regionIntel:s[REGION_INTEL_KEY]||{},regionInfo:s[REGION_INFO_KEY]||{},shopHistory:s[SHOP_HISTORY_KEY]||{},marketIntel:s[MARKET_KEY]||{},ipoListings:s[IPO_KEY]||{},rentMarkets:s[RENT_MARKET_KEY]||{},buildingIntel:s[BUILDING_INTEL_KEY]||{},unitIntel:s[UNIT_INTEL_KEY]||{},navigation:s[NAV_KEY]||{},navigationAnchors:s[NAV_ANCHOR_KEY]||{},watchlist:s[WATCH_KEY]||[],marketScan:s[MARKET_SCAN_KEY]||null,marketScanProgress:s[MARKET_SCAN_PROGRESS_KEY]||null,propertyBuyers:s[PROPERTY_BUYERS_KEY]||{},landBuyTemplate:s[LAND_BUY_TEMPLATE_KEY]||null,landBuyLearning:s[LAND_BUY_LEARN_KEY]||null,landBuySession:(s[LAND_BUY_SESSION_KEY]?.status==='running'&&!activeLandBuySession?{...s[LAND_BUY_SESSION_KEY],status:'interrupted',error:s[LAND_BUY_SESSION_KEY].error||'Batch stopped because the extension worker restarted.'}:s[LAND_BUY_SESSION_KEY]||null),landBuyHistory:s[LAND_BUY_HISTORY_KEY]||[],osmRefs:s[OSM_REF_KEY]||{}})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='networkObservation'){handleObservation(msg.observation).then(()=>respond({ok:true})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='saveShopHealth'){saveShopHealth(msg.payload).then(()=>respond({ok:true})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='loadRegionInfo'){loadRegionInfo(msg.scope,msg.accountId,msg.lon,msg.lat).then(region=>respond({ok:true,region})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='loadShopHistory'){loadShopHistory(msg.accountId,msg.shopId,msg.scope).then(history=>respond({ok:true,history})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='loadShopStock'){loadShopStock(msg.accountId,msg.shopId).then(stock=>respond({ok:true,stock})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='navigationObserved'){chrome.storage.local.set({[NAV_KEY]:{...(msg.payload||{}),at:Date.now()}}).then(()=>respond({ok:true}));return true;}
  if(msg.kind==='saveNavigationAnchor'){saveNavigationAnchor(msg.payload).then(()=>respond({ok:true})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='reverseGeocode'){reverseGeocode(msg.lat,msg.lon).then(location=>respond({ok:true,location})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='autocompletePlaces'){geocodeSearch(msg.query,7).then(rows=>respond({ok:true,rows})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='scoutBuildings'){scoutBuildings(msg.query,msg.radiusM,msg.limit,msg.place||null,msg.criteria||{}).then(result=>respond({ok:true,result})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='surveyVisibleArea'){surveyVisibleArea(msg.viewport,msg.criteria,sender.tab?.id).then(result=>respond({ok:true,result})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='socialGet'){chrome.storage.local.get(CHAT_INTEL_KEY).then(s=>respond({ok:true,intel:s[CHAT_INTEL_KEY]||{}}));return true;}
  if(msg.kind==='socialSummary'){socialSummary().then(intel=>respond({ok:true,intel})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='socialScan'){socialScan(msg.key,msg.options||{}).then(intel=>respond({ok:true,intel})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='socialPostDetails'){socialPostDetails(msg.key,msg.id).then(post=>respond({ok:true,post})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='socialViewed'){socialViewed(msg.id).then(intel=>respond({ok:true,intel}));return true;}
  if(msg.kind==='socialClear'){chrome.storage.local.remove(CHAT_INTEL_KEY).then(()=>respond({ok:true}));return true;}
  if(msg.kind==='getCompanyTransactions'){getCompanyTransactions(msg.personalId,msg.companyId).then(log=>respond({ok:true,log})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='currentCompanyIdentity'){gameGet('/me').then(me=>{const active=activeAccountFromMe(me);respond({ok:true,personalId:me?.playerId||null,companyId:active.scope==='company'&&!active.uncertain?active.id:null,uncertain:active.uncertain,scope:active.scope});}).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='resolveOsmRef'){resolveOsmRef(msg.ref).then(location=>respond({ok:true,location})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='refreshMarketTicker'){refreshMarketTicker().then(result=>respond({ok:true,result})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='enrichMarket'){const snapPromise=chrome.storage.local.get(KEY);snapPromise.then(s=>{const snap=s[KEY]||{},accountId=msg.accountId||snap?.accounts?.company?.id||snap?.accounts?.character?.id;return enrichMarketRows(msg.items||[],accountId);}).then(rows=>respond({ok:true,rows})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='shareHistory30d'){chrome.storage.local.get(KEY).then(async state=>{const snap=state[KEY],accountId=msg.accountId,companyId=String(msg.companyId||'');if(!companyId||!Object.values(snap?.accounts||{}).some(a=>String(a?.id)===String(accountId)&&a?.market?.catalog?.some(r=>String(r.companyId)===companyId)))throw Error('Company is not in the current account share catalog');const hist=await fetchShareHistory(accountId,companyId,'30d'),row={key:`company:${companyId}`,companyId,...marketBookMetrics(null,hist,'30d'),source:'Capital Rift share history 30d'};await mergeMarketIntel([row]);return row;}).then(row=>respond({ok:true,row})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='scanMarket'){fullMarketScan().then(result=>respond({ok:true,result})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='setWatchlist'){chrome.storage.local.set({[WATCH_KEY]:arr(msg.watchlist).slice(0,100)}).then(()=>respond({ok:true}));return true;}
  if(msg.kind==='startRenameLearning'){beginRenameLearning(msg).then(learning=>respond({ok:true,learning})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='cancelRenameLearning'){chrome.storage.local.remove(LEARN_KEY).then(()=>respond({ok:true}));return true;}
  if(msg.kind==='startLandBuyLearning'){beginLandBuyLearning(msg).then(learning=>respond({ok:true,learning})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='resolveLandParcels'){resolveLandParcels(msg.refs).then(result=>respond({ok:true,result})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='cancelLandBuyLearning'){chrome.storage.local.remove(LAND_BUY_LEARN_KEY).then(()=>respond({ok:true}));return true;}
  if(msg.kind==='massBuyLand'){runLandBuyBatch(msg).then(session=>respond({ok:true,session})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='stopLandBuy'){stopLandBuy().then(stopping=>respond({ok:true,stopping})).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='startBuildingRenameLearning'){chrome.storage.local.get(KEY).then(s=>{const ref=String(msg.ref||''),scope=msg.scope,accountId=msg.accountId;if(!ownedBuilding(s[KEY],scope,accountId,ref))throw Error('Select a building deed confirmed in your Assets menu.');const asset=arr(s[KEY].accounts[scope].assetInventory.buildings).find(b=>String(b.ref)===ref)?.raw||{},marker=`CRCC_BUILDING_${Date.now().toString(36).toUpperCase()}`,learning={active:true,startedAt:Date.now(),marker,ref,scope,accountId,asset:{chunkId:asset.chunkId??null}};return chrome.storage.local.set({[BUILDING_LEARN_KEY]:learning}).then(()=>respond({ok:true,learning}));}).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='cancelBuildingRenameLearning'){chrome.storage.local.remove(BUILDING_LEARN_KEY).then(()=>respond({ok:true}));return true;}
  if(msg.kind==='renameBuilding'){performBuildingRename(msg.scope,msg.accountId,msg.ref,msg.newName).then(r=>respond(r)).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='renameShop'){performRename(msg.shop||{},msg.newName,msg.scope,msg.accountId).then(r=>respond(r)).catch(e=>respond({ok:false,error:e.message}));return true;}
  if(msg.kind==='openDashboard'){chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')}).then(()=>respond({ok:true}));return true;}
  if(msg.kind==='clear'){scoutDataRevision++;scoutMapCache.clear();scoutResultCache.clear();viewportSurveyCache.clear();chrome.storage.local.get(null).then(all=>chrome.storage.local.remove([KEY,LAST_COMPANY_KEY,HISTORY_KEY,HOURLY_KEY,GEO_KEY,PLAYER_TRACK_KEY,HEALTH_KEY,OBS_KEY,MARKET_KEY,IPO_KEY,PARCEL_INTEL_KEY,BUILDING_INTEL_KEY,UNIT_INTEL_KEY,SCOUT_INDEX_KEY,SCOUT_ACCOUNT_KEY,SCOUT_CHUNK_KEY,NAV_KEY,NAV_ANCHOR_KEY,MARKET_SCAN_KEY,MARKET_SCAN_PROGRESS_KEY,PROPERTY_BUYERS_KEY,LAND_BUY_TEMPLATE_KEY,LAND_BUY_LEARN_KEY,LAND_BUY_SESSION_KEY,LAND_BUY_HISTORY_KEY,OSM_REF_KEY,ASSET_OBS_KEY,BUILDING_RENAME_KEY,BUILDING_LEARN_KEY,'crcc_gross_ids_v1',GROSS_REBASE_KEY,...Object.keys(all).filter(k=>k.startsWith(SCOUT_UNIT_PREFIX))])).then(()=>respond({ok:true}));return true;}
});
