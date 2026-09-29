/* Read-only projections of CapitalRift's own browser cache. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CRCCGameCache=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const TTL=5*24*60*60*1000;
  const validId=id=>/^15\/\d+\/\d+$/.test(String(id||''));
  function chunk(record,id,now=Date.now()){
    if(!record||record.chunkId!==id||record.schemaVersion!==2||!Number.isFinite(Number(record.ts))||Number(record.ts)>now||now-Number(record.ts)>TTL||typeof record.raw!=='string')return null;
    try{const raw=JSON.parse(record.raw);if(raw?.base?.chunkId!==id||!Array.isArray(raw.base.buildings)||raw.base.buildings.length>3000)return null;
      const buildings=[];let footprintPoints=0;for(const item of raw.base.buildings){if(item?.type!=='building'||!/^(?:way|relation)\/\d+$/.test(item.ref||''))continue;
        // Bounded footprint; the authoritative area and economics come from building-info.
        const footprint=Array.isArray(item.footprint)&&item.footprint.length<=200?item.footprint:null;
        if(!footprint)continue;footprintPoints+=footprint.length;if(footprintPoints>20000)return null;
        buildings.push({type:'building',ref:item.ref,footprint,tags:{name:typeof item.tags?.name==='string'?item.tags.name.slice(0,160):''}});
      }
      return{data:{base:{chunkId:id,buildings,fetchedAt:raw.base.fetchedAt},edits:Array.isArray(raw.edits)&&raw.edits.length?[1]:[]},cacheTs:Number(record.ts),ageMs:now-Number(record.ts)};
    }catch(_){return null;}
  }
  function geometry(record,id){
    if(!record||record.chunkId!==id||!Array.isArray(record.results))return [];
    const out=[];for(const x of record.results){if(out.length>=500)break;if(!/^(?:way|relation)\/\d+$/.test(x?.ref||''))continue;
      const hint={ref:x.ref};for(const k of ['archetypeName','subtypeName'])if(typeof x[k]==='string')hint[k]=x[k].slice(0,80);
      for(const k of ['height','wallTop'])if(Number.isFinite(x[k]))hint[k]=x[k];
      if(typeof x.isSkyscraper==='boolean')hint.isSkyscraper=x.isSkyscraper;
      if(x.obox&&typeof x.obox==='object')hint.obox=Object.fromEntries(['w','d'].filter(k=>Number.isFinite(x.obox[k])).map(k=>[k,x.obox[k]]));
      out.push(hint);
    }return out;
  }
  function matches(hint,filters={}){if(filters.skyscraper&&!hint?.isSkyscraper)return false;if(Number.isFinite(Number(filters.minHeight))&&filters.minHeight!==''&&Number(hint?.height)<Number(filters.minHeight))return false;
    if(filters.archetype&&!String(hint?.archetypeName||'').toLowerCase().includes(String(filters.archetype).toLowerCase()))return false;
    if(filters.subtype&&!String(hint?.subtypeName||'').toLowerCase().includes(String(filters.subtype).toLowerCase()))return false;return true;}
  async function read(ids,{geometryHints=false,now=Date.now(),indexedDBImpl=globalThis.indexedDB}={}){
    if(!indexedDBImpl||!Array.isArray(ids)||ids.length>100)return{chunks:{},geometry:{},available:false};
    let databases;try{databases=await indexedDBImpl.databases();if(!databases.some(d=>d.name==='capitalrift'))return{chunks:{},geometry:{},available:false};}catch(_){return{chunks:{},geometry:{},available:false};}
    const db=await new Promise(resolve=>{let req;try{req=indexedDBImpl.open('capitalrift');req.onupgradeneeded=()=>{req.transaction?.abort();resolve(null);};req.onerror=()=>resolve(null);req.onsuccess=()=>resolve(req.result);}catch(_){resolve(null);}});
    if(!db)return{chunks:{},geometry:{},available:false};
    const result={chunks:{},geometry:{},available:db.objectStoreNames.contains('chunks')};
    try{if(!result.available)return result;const tx=db.transaction(['chunks',...(geometryHints&&db.objectStoreNames.contains('geometry')?['geometry']:[])],'readonly'),chunks=tx.objectStore('chunks');
      const get=(store,key)=>new Promise(resolve=>{try{const q=store.get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>resolve(null);}catch(_){resolve(null);}});
      for(const id of [...new Set(ids)].filter(validId)){const projected=chunk(await get(chunks,id),id,now);if(projected)result.chunks[id]=projected;}
      if(geometryHints&&tx.objectStoreNames.contains('geometry')){const store=tx.objectStore('geometry');
        // Geometry keys vary by build. Query the chunkId index if present; never cursor-scan the store.
        if(store.indexNames.contains('chunkId')){const idx=store.index('chunkId');for(const id of [...new Set(ids)].filter(validId).slice(0,2)){const row=await get(idx,id);const hints=geometry(row,id);if(hints.length)result.geometry[id]=hints;}}
      }
    }catch(_){}finally{db.close();}return result;
  }
  return{TTL,chunk,geometry,matches,read};
});
