const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {openExact}=require('../room-navigation.js');
const row=(key,visible=true)=>({getAttribute:name=>name==='data-unit-key'?key:null,getClientRects:()=>visible?[{}]:[],closest:()=>null,click(){this.clicks=(this.clicks||0)+1;}});
const doc=rows=>({querySelectorAll:selector=>{assert.equal(selector,'.cr-root [data-unit-key], .cr-root [data-room-key]');return rows;}});
test('only a unique visible game row with exact stable key is clicked',()=>{
  const a=row('way/1/f0/bed0'),b=row('way/1/f0/bed1');
  assert.deepEqual(openExact(doc([a,b]),'way/1/f0/bed1'),{ok:true});
  assert.equal(a.clicks||0,0);assert.equal(b.clicks,1);
  assert.equal(openExact(doc([a]),'way/1/f0/bed1').reason,'missing');
  assert.equal(openExact(doc([b,b]),'way/1/f0/bed1').reason,'ambiguous');
  assert.equal(b.clicks,1);
  assert.equal(openExact(doc([row('way/1/f0/bed1',false)]),'way/1/f0/bed1').reason,'missing');
});
test('Scout and Deals pass exact unit key, preserve camera destination, and show manual target',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'../content.js'),'utf8');
  const bridge=fs.readFileSync(path.join(__dirname,'../bridge.js'),'utf8');
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../manifest.json'),'utf8'));
  assert.match(ui,/unitKey:String\(target\.ref\)/);
  assert.match(ui,/buildingLabel:row\.buildingLabel,floor:row\.floor,areaM2:row\.areaM2/);
  assert.match(ui,/if\(e\.entityType==='room'\|\|e\.entityType==='shop'\)openExactScoutRoom\(e\)/);
  assert.match(ui,/if\(row\.entityType==='room'\|\|row\.entityType==='shop'\)\{openExactScoutRoom\(row\)/);
  assert.match(bridge,/CRCCRoomNavigation\?\.openExact\(document,key\)/);
  const scripts=manifest.content_scripts.find(x=>x.world==='MAIN').js;
  assert.ok(scripts.indexOf('room-navigation.js')<scripts.indexOf('bridge.js'));
});
