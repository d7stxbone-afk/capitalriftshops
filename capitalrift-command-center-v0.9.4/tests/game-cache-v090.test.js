const assert=require('node:assert/strict');
const fs=require('node:fs');
const cache=require('../game-cache.js');
const id='15/123/456',now=1_800_000_000_000;
const base={base:{chunkId:id,fetchedAt:'now',buildings:[{type:'building',ref:'way/42',footprint:[[1,2],[3,4]],tags:{name:'Office'}},{type:'road',ref:'way/50'}]},edits:[]};
const rec={chunkId:id,raw:JSON.stringify(base),schemaVersion:2,ts:now-1000};
assert.equal(cache.chunk(rec,id,now).data.base.buildings.length,1);
assert.deepEqual(cache.chunk(rec,id,now).data,cache.chunk({...rec},id,now).data);
for(const row of [{...rec,ts:now-cache.TTL-1},{...rec,schemaVersion:3},{...rec,raw:'{'},{...rec,chunkId:'15/999/999'}])assert.equal(cache.chunk(row,id,now),null);
assert.equal(cache.chunk(rec,id,now).ageMs,1000);
const giant={chunkId:id,results:[{ref:'way/42',height:90,isSkyscraper:true,archetypeName:'commercial',subtypeName:'office',cx:1200,cy:2000,hullGeometry:new Uint8Array(5_000_000),windowGeometry:{tooBig:true},obox:{w:50,d:20,matrices:[1,2]}}]};
const hints=cache.geometry(giant,id);
assert.deepEqual(hints,[{ref:'way/42',archetypeName:'commercial',subtypeName:'office',height:90,isSkyscraper:true,obox:{w:50,d:20}}]);
assert(cache.matches(hints[0],{skyscraper:true,minHeight:80,archetype:'comm'}));
assert(!cache.matches(hints[0],{minHeight:100}));
assert.equal(cache.geometry({...giant,chunkId:'other'},id).length,0);
assert.equal(cache.geometry({chunkId:id,results:[null,{ref:'invalid'}]},id).length,0);
const calls=[];
function indexedDBImpl(records){
  return {
    databases:async()=>[{name:'capitalrift'}],
    open(name){
      calls.push(['open',name]);
      const request={};
      queueMicrotask(()=>{
        request.result={
          objectStoreNames:{contains:k=>k==='chunks'},
          transaction(names,mode){
            calls.push(['transaction',mode]);
            return {objectStore(){return {get(key){
              calls.push(['get',key]);
              const req={};
              queueMicrotask(()=>{req.result=records[key];req.onsuccess?.();});
              return req;
            }};}};
          },
          close(){calls.push(['close']);}
        };
        request.onsuccess?.();
      });
      return request;
    }
  };
}
(async()=>{
  assert.deepEqual(await cache.read([id],{indexedDBImpl:null}),{chunks:{},geometry:{},available:false});
  const found=await cache.read([id,id],{now,indexedDBImpl:indexedDBImpl({[id]:rec})});
  assert.equal(found.chunks[id].data.base.buildings[0].ref,'way/42');
  assert.equal(calls.filter(c=>c[0]==='get').length,1);
  assert(!calls.some(c=>/put|add|delete|clear|upgrade/.test(c[0])));
  const stale=await cache.read([id],{now,indexedDBImpl:indexedDBImpl({[id]:{...rec,ts:now-cache.TTL-1}})});
  assert.deepEqual(stale.chunks,{});
  const absent=await cache.read([id],{indexedDBImpl:{databases:async()=>[]}});
  assert.equal(absent.available,false);
  const source=fs.readFileSync(require.resolve('../background.js'),'utf8');
  assert(source.includes("const selected=missing.slice(0,6)")&&source.includes("const url='/chunk/'+id"));
  assert(source.includes('scoutChunkInFlight.get(id)'));
  console.log('PASS: v0.9 chunk cache validation, 5-day TTL, lightweight geometry, missing cache fallback and bounded network integration');
})().catch(e=>{console.error(e);process.exitCode=1;});
