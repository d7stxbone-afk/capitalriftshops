const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../background.js'),'utf8');
const db={};let writes=0;
const ctx=vm.createContext({URL,Date,console,setTimeout,clearTimeout,chrome:{storage:{local:{
  get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,db[k]])),
  set:async values=>{Object.assign(db,values);writes++;}
}}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../scout-survey.js'),'utf8'),ctx);
vm.runInContext(src.slice(0,src.indexOf('async function recordHistory(')),ctx);
vm.runInContext(src.slice(src.indexOf('function osmLabel('),src.indexOf('// ---- live market intelligence')),ctx);
vm.runInContext(src.slice(src.indexOf('function objectWalk('),src.indexOf('async function storeObservation(')),ctx);
vm.runInContext(src.slice(src.indexOf('async function storeObservation('),src.indexOf('async function saveShopHealth(')),ctx);
vm.runInContext('var observationWrites=Promise.resolve();',ctx);
const run=expression=>vm.runInContext(expression,ctx);
(async()=>{
  const chunk='15/27943/12690',bounds=run(`scoutTileBounds('${chunk}')`);
  const lon=(bounds.west+bounds.east)/2,lat=(bounds.north+bounds.south)/2;
  await run(`storeScoutMapTile({chunkId:'${chunk}',buildings:[{ref:'tile/${chunk}/9',lat:${lat},lon:${lon},label:'Map building'}]},Date.now()-10)`);
  ctx.detail={base:{chunkId:chunk,fetchedAt:'2026-09-03T05:24:31.985Z',roads:[{ref:'way/road'}],areas:[{ref:'way/park'}],trees:[{ref:'tree/1'}],buildings:[
    {ref:'way/268230579',type:'building',tags:{name:'정보문화관(P)',building:'university'},footprint:[[lon,lat],[lon+.0001,lat],[lon,lat+.0001]]},
    {ref:'way/268230580',type:'building',tags:{building:'yes'},footprint:[[lon+.00012,lat],[lon+.0002,lat],[lon+.00012,lat+.0001]]},
    {ref:'way/road',type:'road',footprint:[[lon,lat],[lon+.0001,lat],[lon,lat+.0001]]}
  ]},edits:[]};
  const url=`https://play.capitalrift.com/api/chunk/${chunk}`;ctx.url=url;
  await run("storeObservation({kind:'response',method:'GET',status:200,url,data:detail,ts:Date.now()})");
  assert.equal(db.crcc_scout_chunks_v1[chunk].buildingRefs.length,2,'canonical game chunk refs indexed');
  assert(!db.crcc_scout_index_v1[`tile/${chunk}/9`],'canonical refs supersede tile-only feature identities');
  assert.equal(db.crcc_scout_index_v1['way/268230579'].label,'정보문화관(P)');
  assert(!db.crcc_scout_index_v1['way/park']&&!db.crcc_scout_index_v1['way/road'],'unrelated geometry ignored');
  assert(!db.crcc_observed_v4,'full raw chunk was not stored');
  const before=writes;await run("storeObservation({kind:'response',method:'GET',status:200,url,data:detail,ts:Date.now()})");
  assert.equal(writes,before,'unchanged fetchedAt reuses normalized index');
  await run(`storeScoutMapTile({chunkId:'${chunk}',buildings:[{ref:'tile/${chunk}/10',lat:${lat},lon:${lon}}]},Date.now())`);
  assert(!db.crcc_scout_index_v1[`tile/${chunk}/10`],'later tile responses cannot reintroduce duplicate generic identities');
  ctx.viewport={...bounds,source:'game-land-request',chunkIds:[chunk]};
  const first=await run('surveyVisibleArea(viewport)');
  assert.equal(first.entities.filter(x=>x.entityType==='building').length,2);
  assert.equal(first.entities.filter(x=>x.entityType==='room').length,0,'footprint alone does not invent rooms');
  assert.equal(run("CRCCScoutSurvey.active({target:'building',roomsMin:5}).roomsMin"),5);
  const calls=[];ctx.gameGet=async u=>{calls.push(u);const ref=new URL(u,'https://play.capitalrift.com/api/').searchParams.get('ref');return {ref,label:ref,areaM2:9000,rentableUnits:[{key:ref+'/f0/room',kind:'room',areaM2:480,rentPerDay:500,status:'vacant'}]};};
  const roomSurvey=await run("surveyVisibleArea(viewport,{target:'room',roomMax:500})");
  assert.equal(roomSurvey.entities.filter(x=>x.entityType==='room').length,2,'details join to footprint refs');
  ctx.roomEntities=roomSurvey.entities;
  assert.equal(run("CRCCScoutSurvey.filter(roomEntities,{target:'building',roomsMin:1}).matches.length"),0,'room survey does not process buildings as results');
  const buildingSurvey=await run("surveyVisibleArea(viewport,{target:'building'})");
  ctx.buildingEntities=buildingSurvey.entities;
  assert.equal(run("CRCCScoutSurvey.filter(buildingEntities,{target:'building',roomsMin:1}).matches.length"),2);
  assert.equal(run("CRCCScoutSurvey.filter(buildingEntities,{target:'building',roomsMin:2}).matches.length"),0);
  assert.equal(calls.length,2,'one detail GET per canonical building');
  await run("surveyVisibleArea(viewport,{target:'room',roomMax:500})");
  assert.equal(calls.length,2,'unchanged details do not refetch');
  const nextId='15/27944/12690',nextBox=run(`scoutTileBounds('${nextId}')`),nextLon=(nextBox.west+nextBox.east)/2,nextLat=(nextBox.north+nextBox.south)/2;
  ctx.many={chunkId:nextId,gameChunk:true,geometryFetchedAt:'v1',buildings:Array.from({length:60},(_,i)=>({ref:`way/${100000+i}`,lat:nextLat,lon:nextLon+i*.000001}))};
  await run('storeScoutMapTile(many,Date.now())');ctx.viewport2={...nextBox,source:'game-land-request',chunkIds:[nextId]};
  const firstBatch=await run("surveyVisibleArea(viewport2,{target:'room',roomMax:500})");
  assert.equal(firstBatch.stats.detailsRequested,48,'large room searches cap detail reads at 48');
  assert.equal(firstBatch.stats.detailsRemaining,12,'remaining work is visible to Scout');
  const secondBatch=await run("surveyVisibleArea(viewport2,{target:'room',roomMax:500})");
  assert.equal(secondBatch.stats.detailsRequested,12,'next explicit survey continues to remaining buildings');
  assert.equal(secondBatch.stats.detailsRemaining,0);
  const missingId='15/27945/12690',missingBounds=run(`scoutTileBounds('${missingId}')`),missingLat=(missingBounds.north+missingBounds.south)/2,missingLon=(missingBounds.east+missingBounds.west)/2;
  ctx.missingViewport={...missingBounds,source:'game-land-request',chunkIds:[missingId]};
  const callsFromMissing=[];ctx.gameGet=async u=>{
    callsFromMissing.push(u);
    if(u.startsWith('/chunk/'))return {base:{chunkId:missingId,fetchedAt:'2026-09-24T00:00:00.000Z',buildings:[{ref:'way/876543',type:'building',tags:{building:'yes'},footprint:[[missingLon,missingLat],[missingLon+.0001,missingLat],[missingLon,missingLat+.0001]]}]},edits:[]};
    return {ref:'way/876543',areaM2:2000,rentableUnits:[{key:'way/876543/f0/room',kind:'room',areaM2:360,status:'vacant',rentPerDay:310}]};
  };
  const hydrated=await run("surveyVisibleArea(missingViewport,{target:'room',roomMax:500})");
  assert.equal(hydrated.stats.buildingChunksFetched,1,'survey fetches missing official building chunk');
  assert(hydrated.entities.some(e=>e.ref==='way/876543/f0/room'),'first survey discovers rooms without opening a building');
  assert.equal(callsFromMissing.filter(u=>u.startsWith('/chunk/')).length,1);
  assert.equal(callsFromMissing.filter(u=>u.startsWith('/building-info?')).length,1);
  await run("surveyVisibleArea(missingViewport,{target:'room',roomMax:500})");
  assert.equal(callsFromMissing.length,2,'unchanged chunk and building details reused');
  const mapId='15/27947/12690',mapBox=run(`scoutTileBounds('${mapId}')`),mapLon=(mapBox.west+mapBox.east)/2,mapLat=(mapBox.north+mapBox.south)/2;
  ctx.mapView={north:mapLat+.0002,south:mapLat-.0002,east:mapLon+.0002,west:mapLon-.0002,source:'game-map-bounds'};
  const mapCalls=[];ctx.gameGet=async u=>{mapCalls.push(u);if(u.startsWith('/chunk/'))return{base:{chunkId:mapId,fetchedAt:'map-bounds-v1',buildings:[{ref:'way/955001',type:'building',tags:{building:'yes'},footprint:[[mapLon,mapLat],[mapLon+.0001,mapLat],[mapLon,mapLat+.0001]]}]},edits:[]};return{ref:'way/955001',areaM2:1400,rentableUnits:[{key:'way/955001/f0/room',kind:'room',areaM2:200,status:'vacant'}]};};
  const mapSurvey=await run("surveyVisibleArea(mapView,{target:'room',roomMax:500})");
  assert.equal(mapSurvey.stats.chunksRequested,1,'verified game map bounds select one actual z15 chunk');
  assert.equal(mapSurvey.stats.buildingChunksFetched,1);
  assert(mapSurvey.entities.some(e=>e.ref==='way/955001/f0/room'),'map-bounds survey reads official building details');
  assert.equal(mapCalls.filter(u=>u.startsWith('/chunk/')).length,1);
  await run("surveyVisibleArea(mapView,{target:'room',roomMax:500})");
  assert.equal(mapCalls.length,2,'repeated survey reuses its unchanged building and room data');
  await assert.rejects(run("surveyVisibleArea({north:1,south:-1,east:1,west:-1,source:'game-map-bounds'},{target:'building'})"),/more than 100 building chunks/);
  const eight=Array.from({length:8},(_,i)=>`15/${27950+i}/12690`),west=run(`scoutTileBounds('${eight[0]}')`),east=run(`scoutTileBounds('${eight[7]}')`);
  ctx.wide={north:west.north,south:west.south,west:west.west,east:east.east,source:'game-land-request',chunkIds:eight};
  const chunkCalls=[];ctx.gameGet=async u=>{chunkCalls.push(u);await new Promise(resolve=>setTimeout(resolve,2));return {base:{chunkId:u.slice('/chunk/'.length),fetchedAt:'static-v1',buildings:[]},edits:[]};};
  const together=await Promise.all([run('surveyVisibleArea(wide)'),run('surveyVisibleArea(wide)')]);
  assert.equal(chunkCalls.length,6,'simultaneous searches share one six-chunk batch');
  assert.equal(together[0].stats.buildingChunksRemaining,2);
  await run('surveyVisibleArea(wide)');assert.equal(chunkCalls.length,8,'next explicit survey loads only remaining chunks');
  await run('surveyVisibleArea(wide)');assert.equal(chunkCalls.length,8,'zero-building chunks are cached as valid complete responses');
  const liveSample=path.join(__dirname,'../../upload/Pasted text(20260924-031653).txt');
  if(fs.existsSync(liveSample)){
    ctx.sample=JSON.parse(fs.readFileSync(liveSample,'utf8'));
    const normalized=run('scoutGameChunkBuildings(sample,sample.base.chunkId)');
    assert.equal(normalized.buildings.length,560,'user-supplied real game chunk indexes every building');
    await run("storeObservation({kind:'response',method:'GET',status:200,url,data:sample,ts:Date.now()})");
    assert(db.crcc_scout_chunks_v1[chunk].buildingRefs.length>=560,'real sample merged into the surveyed chunk');
  }
  console.log('PASS: actual /api/chunk base.buildings shape, canonical refs, unrelated layers ignored, same chunk reused, bounded room details');
})().catch(e=>{console.error(e);process.exitCode=1;});
