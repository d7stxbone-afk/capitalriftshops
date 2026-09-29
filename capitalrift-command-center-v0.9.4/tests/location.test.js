const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

(async()=>{
  const src=fs.readFileSync(path.join(__dirname,'../content.js'),'utf8');
  const state={geo:{},osmRefs:{},locationCursor:0},calls=[];
  const ctx=vm.createContext({
    state,console,chrome:{runtime:{sendMessage:async request=>{
      calls.push(request.kind);
      return request.kind==='resolveOsmRef'?{ok:false,error:'Lookup unavailable'}:{ok:true,location:{city:'Paris',country:'France'}};
    }}},
    validCoord:(lat,lon)=>lat!=null&&lon!=null&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lon)),
    geoKey:(lat,lon)=>`${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`,
    locationFor:(lat,lon)=>state.geo[`${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`]||null,
    render:()=>{},toast:()=>{}
  });
  vm.runInContext(src.slice(src.indexOf('  async function resolveLocation(row,quiet=false){'),src.indexOf('  function expectedAccount()')),ctx);
  vm.runInContext(src.slice(src.indexOf('  async function autoResolveProperties(rows){'),src.indexOf('  function bindDynamic(a){')),ctx);
  ctx.row={ref:'way/123',lat:48.8584,lon:2.2945};
  const result=await vm.runInContext('resolveLocation(row)',ctx);
  assert.equal(result.city,'Paris');assert.equal(result.country,'France');
  assert.deepEqual(calls,['resolveOsmRef','reverseGeocode'],'failed OSM lookup must attempt reverse geocoding from the official anchor');
  const mergeLocation=src.slice(src.indexOf('  function locationFor('),src.indexOf('  function formatLoc('));
  const partial=vm.runInNewContext(`${mergeLocation}\nlocationFor(48,2,'Paris',null,null)`,{state:{geo:{'48.0000,2.0000':{country:'France'}}},geoKey:(lat,lon)=>`${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`});
  assert.equal(partial.country,'France','reverse-geocoded country fills a partial game city');
  ctx.rows=Array.from({length:13},(_,i)=>({ref:`way/${i+1000}`,lat:48+i*.01,lon:2.2}));
  await vm.runInContext('autoResolveProperties(rows)',ctx);
  assert.equal(Object.keys(state.geo).length,13,'first batch plus individually resolved location');
  await vm.runInContext('autoResolveProperties(rows)',ctx);
  assert.equal(Object.keys(state.geo).length,14,'second button press advances past already resolved locations');
  const attempted=[];state.geo={};state.locationCursor=0;
  ctx.chrome.runtime.sendMessage=async request=>{if(request.kind==='resolveOsmRef')attempted.push(request.ref);return{ok:false,error:'Service unavailable'};};
  ctx.rows=Array.from({length:25},(_,i)=>({ref:`way/${i+2000}`,lat:40+i*.01,lon:2.2}));
  await vm.runInContext('autoResolveProperties(rows)',ctx);
  await vm.runInContext('autoResolveProperties(rows)',ctx);
  assert.equal(attempted.length,24);assert.equal(attempted[12],'way/2012','repeated clicks advance even when the map provider fails');

  const bg=fs.readFileSync(path.join(__dirname,'../background.js'),'utf8');
  const stored={},urls=[];
  const b=vm.createContext({URL,Date,console,
    chrome:{storage:{local:{get:async()=>stored,set:async rows=>Object.assign(stored,rows)}}},
    fetch:async url=>{urls.push(String(url));return{ok:true,json:async()=>String(url).includes('/lookup')?[{lat:'48.8584',lon:'2.2945',address:{country:'France'}}]:{address:{city:'Paris',country:'France'}}};}
  });
  vm.runInContext(bg.slice(0,bg.indexOf('async function recordHistory(')),b);
  vm.runInContext(bg.slice(bg.indexOf('let geoChain=Promise.resolve(0)'),bg.indexOf('async function overpassJson(')),b);
  vm.runInContext('paceGeo=async()=>0',b);
  const lookup=await vm.runInContext("resolveOsmRef('way/123')",b);
  assert.equal(lookup.city,'Paris','incomplete lookup enriches locality from reverse geocode');
  assert.equal(urls.length,2);
  await vm.runInContext("resolveOsmRef('way/123')",b);
  assert.equal(urls.length,2,'completed lookup result is cached');
  vm.runInContext(bg.slice(bg.indexOf('function objectWalk('),bg.indexOf('async function storeObservation(')),b);
  stored.crcc_snapshot_v4={accounts:{company:{id:'company-a',income:{sources:{shops:{rows:[{id:'shop-a',buildingRef:'way/101',chunkId:'15/1/2'}]}}}}}};
  const paths=[];b.paths=paths;
  vm.runInContext("gameGet=async path=>{paths.push(path);return{furniture:[{id:'shelf-1',buildingRef:'way/101',sale:{shopId:'shop-a',qty:0}},{id:'shelf-2',buildingRef:'way/101',sale:{shopId:'shop-a',qty:4}}]}}",b);
  const stock=await vm.runInContext("loadShopStock('company-a','shop-a')",b);
  assert.equal(stock.shelves,2);assert.equal(stock.emptyShelves,1);
  assert.equal(paths[0],'/building-furniture?ref=way%2F101&chunk=15%2F1%2F2');
  await assert.rejects(()=>vm.runInContext("loadShopStock('other-company','shop-a')",b),/no game building and chunk IDs/i);
  assert.equal(paths.length,1,'unowned shops do not trigger a network stock read');
  vm.runInContext(bg.slice(bg.indexOf('async function saveShopHealth('),bg.indexOf('async function saveNavigationAnchor(')),b);
  b.healthPayload={accountId:'company-a',shopKey:'shop-a',at:1000,appealGrade:79,registerBusy:86};
  await vm.runInContext('saveShopHealth(healthPayload)',b);
  b.healthPayload={accountId:'company-a',shopKey:'shop-a',at:2000,appealGrade:null,registerBusy:87};
  await vm.runInContext('saveShopHealth(healthPayload)',b);
  assert.equal(stored.crcc_shop_health_v4['company-a:shop-a'].appealGrade,79,'partial panel observations preserve prior official readings');
  b.healthPayload={accountId:'company-a',shopKey:'shop-a',at:500,appealGrade:1};
  await vm.runInContext('saveShopHealth(healthPayload)',b);
  assert.equal(stored.crcc_shop_health_v4['company-a:shop-a'].appealGrade,79,'stale panel observations cannot overwrite newer readings');
  console.log('PASS: manual and batched city/country fallback, incomplete lookup enrichment and cache');
})().catch(e=>{console.error(e);process.exitCode=1;});
