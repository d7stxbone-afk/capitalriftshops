const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const handlers={},emitted=[],polls=[];
const fake={__cr:{setCameraLonLat(){},map:{getBounds(){return{getNorth:()=>40.1,getSouth:()=>40,getEast:()=>-75,getWest:()=>-75.1};},getZoom:()=>14}},fetch:async()=>({ok:true,status:200,headers:{get:()=> 'application/json'},clone(){return{json:async()=>({parcelId:'abc123',purchaseOffer:{price:125}}),text:async()=>'{"ok":true}'}}}),addEventListener:(name,fn)=>handlers[name]=fn,postMessage:x=>emitted.push(x)};
const location={href:'https://play.capitalrift.com/',origin:'https://play.capitalrift.com'};
const ctx=vm.createContext({window:fake,location,history:{state:{},replaceState(){}},URL,URLSearchParams,Request:class{},FormData:class{},XMLHttpRequest:{prototype:{open(){},send(){}}},setInterval:fn=>polls.push(fn),setTimeout,Date,Number,console});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../bridge.js'),'utf8'),ctx);
const ask=()=>handlers.message({source:fake,data:{__crccCommand:true,kind:'scoutViewport',commandId:'test'}});
ask();assert.equal(emitted.at(-1).viewport.north,40.1);assert.equal(emitted.at(-1).viewport.source,'game-map-bounds');
fake.__cr.map.getBounds=()=>({north:0,south:0,east:0,west:0});ask();assert.equal(emitted.at(-1).viewport,null,'invalid bounds must not be manufactured');
fake.__cr.map.getBounds=()=>({north:40.2,south:40.1,east:-75.1,west:-75.2});polls[0]();assert.equal(emitted.at(-1).kind,'scoutViewport');assert.equal(emitted.at(-1).viewport.north,40.2);
console.log('PASS: verified live map bounds, unavailable map, changed viewport signal');
// The real game exposes a camera and /api/world land requests, without a map
// bounds getter. Vehicles and owned-only land must not replace the survey area.
(async()=>{
 await fake.fetch('https://play.capitalrift.com/api/land/abc123');
 await Promise.resolve();
 assert(emitted.some(e=>e.kind==='response'&&e.url?.endsWith('/api/land/abc123')&&e.data?.purchaseOffer?.price===125),'game land detail GET is observed');
 await fake.fetch('https://play.capitalrift.com/api/land/abc123',{method:'POST',body:JSON.stringify({action:'buy',parcelId:'abc123'})});await Promise.resolve();
 assert(emitted.some(e=>e.kind==='response'&&e.method==='POST'&&e.url?.endsWith('/api/land/abc123')&&e.data?.ok===true),'land buy action on a plain land URL observes its success response');
 delete fake.__cr.map;
 fake.__cr.controls={target:{x:10000,y:20000}};
 const world='https://play.capitalrift.com/api/world';
 const response={headers:{get:()=>''}};
 await fake.fetch(world,{method:'POST',body:JSON.stringify({parts:[{layer:'vehicles',chunks:['15/100/100']},{layer:'land',owned:true,chunks:['15/101/101']}]})});
 ask();assert.equal(emitted.at(-1).viewport,null,'unrelated layers do not create survey bounds');
 const ids=['15/21612/18264','15/21613/18264'];
 await fake.fetch(world,{method:'POST',body:JSON.stringify({parts:[{layer:'vehicles',chunks:['15/100/100']},{layer:'land',chunks:ids,known:{[ids[0]]:'hash'}}]})});
 ask();const view=emitted.at(-1).viewport;assert.equal(view.source,'game-land-request');assert.deepEqual([...view.chunkIds],ids);
 assert(view.east>view.west&&view.north>view.south);
 fake.__cr.controls.target.x+=150;polls[0]();assert.equal(emitted.at(-1).kind,'scoutViewport');
 fake.__cr.controls.target.x+=3000;ask();assert.equal(emitted.at(-1).viewport,null,'panning far beyond last land request invalidates old area');
 // An empty camera helper previously reported success without moving the map.
 // The observed game chunk calibrates the Three.js camera target instead.
 const centerLon=(view.east+view.west)/2,centerLat=(view.north+view.south)/2;
 const project=(lon,lat)=>({x:6378137*lon*Math.PI/180,y:6378137*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))});
 const here=project(centerLon,centerLat),destination=project(centerLon+.01,centerLat+.01);
 Object.assign(fake.__cr.controls.target,here);
 fake.__cr.controls.update=()=>{};
 fake.__cr.camera={position:{x:here.x,y:here.y+150,z:300},updateMatrixWorld(){}};
 handlers.message({source:fake,data:{__crccCommand:true,kind:'camera',lat:centerLat+.01,lon:centerLon+.01,commandId:'public-room'}});
 await new Promise(resolve=>setTimeout(resolve,1000));
 assert.equal(emitted.find(e=>e.commandId==='public-room')?.ok,true,'no-op helper falls back to verified game camera controls');
 assert(Math.abs(fake.__cr.controls.target.x-destination.x)<1&&Math.abs(fake.__cr.controls.target.y-destination.y)<1);
 assert(Math.abs(fake.__cr.camera.position.y-(destination.y+150))<1,'camera preserves its offset from orbit target');
 Object.assign(fake.__cr.controls.target,{x:100,y:100});
 handlers.message({source:fake,data:{__crccCommand:true,kind:'camera',lat:centerLat+.02,lon:centerLon+.02,commandId:'unverified'}});
 await new Promise(resolve=>setTimeout(resolve,1000));
 assert.equal(emitted.find(e=>e.commandId==='unverified')?.ok,false,'fallback refuses uncalibrated camera coordinates');
 console.log('PASS: real game land requests, owned and vehicle exclusions, motion signal, stale-area guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
