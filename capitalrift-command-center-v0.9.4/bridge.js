/* Page-world bridge v0.6: passive Capital Rift request observation + resilient local camera navigation. */
(() => {
  if (window.__crccBridgeInstalledV6) return;
  window.__crccBridgeInstalledV6 = true;

  try {
    const u=new URL(location.href);
    if(!u.searchParams.has('debug')){u.searchParams.set('debug','');history.replaceState(history.state,'',u.href);}
  } catch(_) {}

  const API_PREFIX=location.origin+'/api/';
  const absolute=url=>{try{return new URL(String(url||''),location.href).href;}catch(_){return String(url||'');}};
  const relevant=url=>{url=absolute(url);return url.startsWith(API_PREFIX)&&/(?:income|company|store|shop|room|building|property|region|retail|demand|game|rename|market|share|order|ticker|quote|ipo|offering|filing|worker|asset|leaderboard|access|bank|chunk|parcel|land|terrain|world|map|tile|inspect|detail|resolve)/i.test(url);};
  // The full /game/{account} feed is already fetched and normalized by the worker.
  const observeRead=url=>relevant(url)&&!/\/api\/game\/[^/?#]+(?:[?#]|$)/.test(url);
  const purchaseWrite=(url,body)=>url.startsWith(API_PREFIX)&&(/(?:buy|purchase|acquire)/i.test(url)&&/(?:land|parcel)/i.test(url)||Object.entries(body&&typeof body==='object'?body:{}).some(([key,value])=>/(?:action|operation|type)$/i.test(key)&&(/^(?:buy|purchase|acquire)[_-]?(?:land|parcel)$/i.test(String(value))||/(?:land|parcel)/i.test(url)&&/^(?:buy|purchase|acquire)$/i.test(String(value)))));
  const purchaseResult=data=>data&&typeof data==='object'?{ok:data.ok,success:data.success,error:typeof data.error==='string'?data.error.slice(0,180):undefined}:null;
  const parseBody=body=>{if(body==null)return null;if(typeof body==='string'){try{return JSON.parse(body);}catch(_){return body.slice(0,6000);}}if(body instanceof URLSearchParams)return Object.fromEntries(body.entries());if(body instanceof FormData)return Object.fromEntries([...body.entries()].map(([k,v])=>[k,typeof v==='string'?v:'[blob]']));return null;};
  const emit=d=>{try{window.postMessage({__crccBridge:true,...d},'*');}catch(_){}};
  let internalCamera=false;
  let gameLandView=null;
  const cameraPoint=()=>{const p=window.__cr?.controls?.target;return Number.isFinite(p?.x)&&Number.isFinite(p?.y)?{x:p.x,y:p.y}:null;};
  function chunkBounds(id){const m=/^(\d{1,2})\/(\d+)\/(\d+)$/.exec(id);if(!m)return null;
    const z=Number(m[1]),x=Number(m[2]),y=Number(m[3]),size=2**z;
    if(z<0||z>22||x>=size||y>=size)return null;
    const lat=t=>Math.atan(Math.sinh(Math.PI*(1-2*t/size)))*180/Math.PI;
    return{north:lat(y),south:lat(y+1),west:x/size*360-180,east:(x+1)/size*360-180};
  }
  // These are the chunks requested by the game for its map, including its
  // prefetch margin. They are never claimed to be exact screen bounds.
  function observeLandRequest(url,body){if(!/\/api\/world(?:\?|$)/.test(url)||!Array.isArray(body?.parts))return;
    const ids=[...new Set(body.parts.filter(p=>p?.layer==='land'&&!p.owned).flatMap(p=>Array.isArray(p.chunks)?p.chunks:[]))];
    if(!ids.length||ids.length>400||ids.some(id=>!chunkBounds(id)))return;
    const tiles=ids.map(chunkBounds),north=Math.max(...tiles.map(t=>t.north)),south=Math.min(...tiles.map(t=>t.south)),east=Math.max(...tiles.map(t=>t.east)),west=Math.min(...tiles.map(t=>t.west));
    if(north-south>2||east-west>2)return;
    gameLandView={north,south,east,west,chunkIds:ids,source:'game-land-request',at:Date.now(),cameraPoint:cameraPoint()};reportViewport(true);
  }
  // Read bounds only from a game-exposed map object. A camera center/zoom alone
  // cannot prove which buildings are actually on the screen.
  function readScoutViewport(){
    const cr=window.__cr,candidates=[cr?.map,cr?.gameMap,window.map,window.__map,cr];
    for(const map of candidates){if(!map)continue;let raw=null;
      try{raw=typeof map.getBounds==='function'?map.getBounds():typeof map.getMapBounds==='function'?map.getMapBounds():typeof map.getViewportBounds==='function'?map.getViewportBounds():typeof map.getViewport==='function'?map.getViewport()?.bounds:map.viewport?.bounds??map.mapViewport?.bounds??null;}catch(_){continue;}
      if(!raw)continue;
      const values=[typeof raw.getNorth==='function'?raw.getNorth():raw.north??raw._ne?.lat??raw.ne?.lat,typeof raw.getSouth==='function'?raw.getSouth():raw.south??raw._sw?.lat??raw.sw?.lat,typeof raw.getEast==='function'?raw.getEast():raw.east??raw._ne?.lng??raw.ne?.lng,typeof raw.getWest==='function'?raw.getWest():raw.west??raw._sw?.lng??raw.sw?.lng];
      if(values.some(v=>v==null||v===''))continue;const[north,south,east,west]=values.map(Number);
      if(![north,south,east,west].every(Number.isFinite)||north<=south||north>85.06||south< -85.06||east>180||west< -180||east===west)continue;
      let zoom=null;try{const z=typeof map.getZoom==='function'?map.getZoom():null;if(Number.isFinite(Number(z)))zoom=Number(z);}catch(_){}
      return{north,south,east,west,zoom,source:'game-map-bounds',at:Date.now()};
    }
    if(gameLandView){const current=cameraPoint(),original=gameLandView.cameraPoint;
      if(current&&original&&Math.hypot(current.x-original.x,current.y-original.y)>2500)return null;
      return {...gameLandView,cameraPoint:current};
    }
    return null;
  }
  let lastViewportKey='';function reportViewport(force=false){const viewport=readScoutViewport(),key=viewport?[viewport.north,viewport.south,viewport.east,viewport.west,viewport.zoom,viewport.cameraPoint?.x,viewport.cameraPoint?.y].map(v=>v==null?'':Number(v).toFixed(2)).join(':'):'unavailable';if(force||key!==lastViewportKey){lastViewportKey=key;emit({kind:'scoutViewport',viewport,ts:Date.now()});}}
  setInterval(reportViewport,1200);

  // Capital Rift can replace window.__cr or its camera function while the SPA is
  // running. Re-wrap the current function whenever that happens instead of
  // assuming the first wrapper stays alive for the whole session.
  function installCameraObserver(){
    const cr=window.__cr;if(!cr||typeof cr.setCameraLonLat!=='function')return;
    if(cr.setCameraLonLat.__crccWrapped)return;
    const native=cr.setCameraLonLat.bind(cr);
    function wrapped(lon,lat,zoom,...rest){
      try{if(!internalCamera)emit({kind:'nativeCamera',lon:Number(lon),lat:Number(lat),zoom:Number(zoom)||null,ts:Date.now()});}catch(_){}
      return native(lon,lat,zoom,...rest);
    }
    wrapped.__crccWrapped=true;
    try{cr.setCameraLonLat=wrapped;emit({kind:'cameraCapability',available:true,ts:Date.now()});}catch(_){}
  }
  setInterval(installCameraObserver,1500);installCameraObserver();

  // The game exposes a Three.js camera and orbit target even when its optional
  // setCameraLonLat helper is absent. Only use these controls after confirming
  // their x/y coordinates agree with the game's recently requested map chunks.
  const mercator=(lon,lat)=>{const r=6378137;return{x:r*Number(lon)*Math.PI/180,y:r*Math.log(Math.tan(Math.PI/4+Number(lat)*Math.PI/360))};};
  function verifiedCameraControls(){
    const cr=window.__cr,target=cr?.controls?.target,position=cr?.camera?.position,view=gameLandView;
    if(!view||Date.now()-view.at>120000||!target||!position||![target.x,target.y,position.x,position.y].every(Number.isFinite))return null;
    const sw=mercator(view.west,view.south),ne=mercator(view.east,view.north);
    if(target.x<sw.x-15000||target.x>ne.x+15000||target.y<sw.y-15000||target.y>ne.y+15000)return null;
    if(Math.abs(position.x-target.x)>50000||Math.abs(position.y-target.y)>50000)return null;
    return{cr,target,position};
  }
  function moveVerifiedCamera(lon,lat){
    const controls=verifiedCameraControls();if(!controls)return false;
    const p=mercator(lon,lat),{cr,target,position}=controls,dx=p.x-target.x,dy=p.y-target.y;
    position.x+=dx;position.y+=dy;target.x=p.x;target.y=p.y;
    cr.controls.update?.();cr.camera.updateMatrixWorld?.();reportViewport(true);
    return Math.hypot(target.x-p.x,target.y-p.y)<1;
  }

  async function activeAccount(){
    try{const r=await nativeFetch('/api/me',{method:'GET',credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)return null;const me=await r.json();if(me?.tutorial)return me.playerId?{kind:'character',id:me.playerId}:null;const pilot=me?.piloting,active=me?.activeAccount,id=pilot?.companyId??pilot?.company?.id??(pilot?.kind==='company'?pilot.id:null)??(active?.kind==='company'?active.companyId??active.id:null);if(id)return{kind:'company',id};if(pilot||!me?.playerId)return null;return{kind:'character',id:me.playerId};}catch(_){return null;}
  }
  window.addEventListener('message',e=>{
    const d=e.data;if(e.source!==window||!d?.__crccCommand)return;
    if(d.kind==='readGameCache')void(async()=>{let result={chunks:{},geometry:{},available:false};try{result=await globalThis.CRCCGameCache.read(Array.isArray(d.ids)?d.ids.slice(0,100):[],{geometryHints:!!d.geometryHints});}catch(_){}emit({kind:'gameCacheResult',commandId:d.commandId,result});})();
    if(d.kind==='scoutViewport'){emit({kind:'scoutViewport',commandId:d.commandId,viewport:readScoutViewport(),ts:Date.now()});return;}
    if(d.kind==='openRoomListing'){
      const key=String(d.unitKey||'');let ok=false,message='Open the building panel in CapitalRift, then press Find exact room again. This game view has not exposed a matching unit row.';
      const result=globalThis.CRCCRoomNavigation?.openExact(document,key);
      if(result?.ok){ok=true;message='Opened the exact game room row. Check the game panel for its current listing.';}
      else if(result?.reason==='ambiguous')message='Several game rows share this key; select the room manually in the building panel.';
      emit({kind:'commandResult',commandId:d.commandId,ok,message,ts:Date.now()});return;
    }
    if(d.kind==='camera')void(async()=>{
      const lon=Number(d.lon),lat=Number(d.lat),zoom=Number(d.zoom)||420;let ok=false,message='Capital Rift camera command is not ready. Reload the game tab once and try again.';
      installCameraObserver();
      if(!(Number.isFinite(lon)&&Number.isFinite(lat)&&Math.abs(lon)<=180&&Math.abs(lat)<=85.06&&!(Math.abs(lon)<.00001&&Math.abs(lat)<.00001))){message='This location does not have a valid Capital Rift map coordinate.';emit({kind:'commandResult',commandId:d.commandId,ok,message,ts:Date.now()});return;}
      if(d.expectedAccount?.id){const active=await activeAccount();if(!active||String(active.id)!==String(d.expectedAccount.id)||active.kind!==d.expectedAccount.kind){message=d.expectedAccount.kind==='company'?'Pilot the matching company before opening this location.':'Hand the company back before opening a personal-account location.';emit({kind:'commandResult',commandId:d.commandId,ok,message,ts:Date.now()});return;}}
      try{
        const before=cameraPoint(),native=window.__cr?.setCameraLonLat;
        if(typeof native==='function'){
          internalCamera=true;try{native.call(window.__cr,lon,lat,zoom);}finally{internalCamera=false;}
          if(before){await new Promise(resolve=>setTimeout(resolve,700));const after=cameraPoint(),destination=verifiedCameraControls()?mercator(lon,lat):null;
            ok=!!after&&(destination?Math.hypot(after.x-destination.x,after.y-destination.y)<100:Math.hypot(after.x-before.x,after.y-before.y)>2);
          }
          else ok=true;
        }
        if(!ok){ok=moveVerifiedCamera(lon,lat);
          if(ok){await new Promise(resolve=>setTimeout(resolve,200));const after=cameraPoint(),destination=mercator(lon,lat);ok=!!after&&Math.hypot(after.x-destination.x,after.y-destination.y)<100;}
          message=ok?'Opened the game map near this property.':'The game camera did not move, and its map coordinates could not be verified. Pan the map once and try again.';
        }
        else message='Opened location in Capital Rift.';
      }catch(err){internalCamera=false;message=err?.message||message;}
      emit({kind:'commandResult',commandId:d.commandId,ok,message,ts:Date.now()});
    })();
  });

  const nativeFetch=window.fetch;
  const tileId=url=>/\/api\/maptile\/(\d{1,2}\/\d+\/\d+)\.mvt(?:[?#]|$)/.exec(url)?.[1]||null;
  const pendingTiles=new Map();let tileIdleScheduled=false;
  function processTileWhenIdle(){
    if(tileIdleScheduled||!pendingTiles.size)return;tileIdleScheduled=true;
    const run=()=>{
      tileIdleScheduled=false;
      const next=pendingTiles.entries().next().value;if(!next)return;
      pendingTiles.delete(next[0]);
      try{emitTile(next[1].buffer,next[1].url,next[1].status);}catch(_){}
      processTileWhenIdle();
    };
    if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:2500});else setTimeout(run,150);
  }
  function emitTile(buffer,url,status){
    const chunkId=tileId(url);
    if(!chunkId||status<200||status>=300||!globalThis.CRCCScoutTile||!buffer||buffer.byteLength>4_000_000)return;
    const buildings=globalThis.CRCCScoutTile.decode(buffer,chunkId);
    emit({kind:'response',url,method:'GET',status,data:{scoutMapTile:true,chunkId,buildings},ts:Date.now()});
  }
  function observeTile(res,url){
    if(!tileId(url)||!res.ok||!globalThis.CRCCScoutTile)return;
    const size=Number(res.headers?.get('content-length'));
    if(Number.isFinite(size)&&size>1_500_000)return;
    // A clone reads the bytes the game already requested. Transfer only small
    // building anchors, never the binary response or unrelated map layers.
    res.clone().arrayBuffer().then(buffer=>{
      if(buffer.byteLength>1_500_000)return;
      const id=tileId(url);
      if(pendingTiles.size>=32&&!pendingTiles.has(id))pendingTiles.delete(pendingTiles.keys().next().value);
      pendingTiles.set(id,{buffer,url,status:res.status});processTileWhenIdle();
    }).catch(()=>{});
  }
  window.fetch=async function(input,init={}){
    let url='',method='GET',body=null,bodyReady=Promise.resolve();
    try{const req=input instanceof Request?input:null;url=absolute(req?req.url:String(input));method=String(init.method||req?.method||'GET').toUpperCase();body=parseBody(init.body);if(body)observeLandRequest(url,body);
      if(req&&body==null&&method!=='GET')bodyReady=req.clone().text().then(raw=>{if(raw.length>100000)return;body=parseBody(raw);observeLandRequest(url,body);if(relevant(url)||purchaseWrite(url,body))emit({kind:'request',url,method,body,ts:Date.now()});}).catch(()=>{});
      else if((relevant(url)||purchaseWrite(url,body))&&method!=='GET')emit({kind:'request',url,method,body,ts:Date.now()});}catch(_){}
    const res=await nativeFetch.apply(this,arguments);
    await bodyReady;
    observeTile(res,url);
    try{if(purchaseWrite(url,body)&&method!=='GET'){
      res.clone().text().then(raw=>{let data=null;try{if(raw.length<50000)data=purchaseResult(JSON.parse(raw));}catch(_){}emit({kind:'response',url,method,status:res.status,data,ts:Date.now()});}).catch(()=>emit({kind:'response',url,method,status:res.status,data:null,ts:Date.now()}));
    }else if(observeRead(url)&&(method==='GET'||method==='POST'&&/chunk|parcel|terrain|world|map|tile|region|retail|demand/i.test(url))&&(res.headers.get('content-type')||'').includes('json'))res.clone().json().then(data=>emit({kind:'response',url,method,status:res.status,data,ts:Date.now()})).catch(()=>{});}catch(_){}
    return res;
  };

  const XO=XMLHttpRequest.prototype.open,XS=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(method,url){this.__crcc={method:String(method||'GET').toUpperCase(),url:absolute(url)};return XO.apply(this,arguments);};
  XMLHttpRequest.prototype.send=function(body){
    try{if(this.__crcc){const parsed=parseBody(body),purchase=purchaseWrite(this.__crcc.url,parsed);if(observeRead(this.__crcc.url)||purchase){this.__crcc.purchase=purchase;observeLandRequest(this.__crcc.url,parsed);if(this.__crcc.method!=='GET')emit({kind:'request',url:this.__crcc.url,method:this.__crcc.method,body:parsed,ts:Date.now()});if(this.__crcc.method==='GET'||purchase||this.__crcc.method==='POST'&&/chunk|parcel|terrain|world|map|tile|region|retail|demand/i.test(this.__crcc.url))this.addEventListener('load',()=>{try{if(tileId(this.__crcc.url)&&this.response instanceof ArrayBuffer){const buffer=this.response;if(buffer.byteLength<=1_500_000){const id=tileId(this.__crcc.url);if(pendingTiles.size>=32&&!pendingTiles.has(id))pendingTiles.delete(pendingTiles.keys().next().value);pendingTiles.set(id,{buffer,url:this.__crcc.url,status:this.status});processTileWhenIdle();}return;}let data=null;if(this.responseType==='json')data=this.response;else if(!this.responseType||this.responseType==='text'){const t=this.responseText||'';if(t&&t.length<3000000)data=JSON.parse(t);}if(this.__crcc.purchase||data!=null)emit({kind:'response',url:this.__crcc.url,method:this.__crcc.method,status:this.status,data:this.__crcc.purchase?purchaseResult(data):data,ts:Date.now()});}catch(_){}},{once:true});}}}catch(_){}
    return XS.apply(this,arguments);
  };
})();
