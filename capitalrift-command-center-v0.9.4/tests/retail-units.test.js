const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'../background.js'),'utf8');
const db={};
const ctx=vm.createContext({URL,Date,console,chrome:{storage:{local:{get:async()=>db,set:async patch=>Object.assign(db,patch)}}}});
vm.runInContext(src.slice(0,src.indexOf('async function recordHistory(')),ctx);
vm.runInContext(src.slice(src.indexOf('function osmLabel('),src.indexOf('// ---- live market intelligence')),ctx);
vm.runInContext(src.slice(src.indexOf('function objectWalk('),src.indexOf('async function storeObservation(')),ctx);
vm.runInContext(src.slice(src.indexOf('async function storeObservation('),src.indexOf('async function saveShopHealth(')),ctx);
const run=code=>vm.runInContext(code,ctx);
(async()=>{
  ctx.building={ref:'way/1',label:'Offices',areaM2:4200,value:2467800,paidPrice:2400000,rentableUnits:[
    {key:'way/1/f0/b50',floor:0,label:'Retail unit 50',areaM2:289.27,rentPerDay:507,fairRentPerDay:507,status:'leased',tenantId:'player-a',tenantName:'Test Retail',busyWith:'shop',furnishValue:6178,tenantBought:true},
    {key:'way/1/f0/b51',floor:0,label:'Retail unit 51',areaM2:280,rentPerDay:493,status:'private',tenantId:null,furnishValue:0},
    {key:'way/2/wrong',areaM2:5000}
  ]};
  assert.equal(run('extractRetailBuildings(building)[0].units.length'),2,'unit keys must belong to the building ref');
  await run("storeObservation({kind:'response',method:'GET',status:200,url:'https://play.capitalrift.com/api/building?ref=way%2F1',ts:1000,data:building})");
  const key='crcc_retail_units_v1',first=db[key]['way/1'];assert.equal(Object.keys(first.units).length,2);
  assert.equal(first.units['way/1/f0/b50'].furnishValue,6178);
  assert.equal(first.units['way/1/f0/b50'].tenantId,'player-a');
  ctx.partial={ref:'way/1',rentableUnits:[{key:'way/1/f0/b50',rentPerDay:600}]};
  await run("storeObservation({kind:'response',method:'GET',status:200,url:'https://play.capitalrift.com/api/building?ref=way%2F1',ts:1100,data:partial})");
  assert.equal(db[key]['way/1'].units['way/1/f0/b50'].rentPerDay,600);
  assert.equal(db[key]['way/1'].units['way/1/f0/b50'].furnishValue,6178,'partial response preserves valid furnishings');
  assert.equal(Object.keys(db[key]['way/1'].units).length,2,'partial roster keeps other units');
  await run("storeObservation({kind:'response',method:'GET',status:200,url:'https://play.capitalrift.com/api/building?ref=way%2F1',ts:900,data:building})");
  assert.equal(db[key]['way/1'].units['way/1/f0/b50'].rentPerDay,600,'older observation cannot revert the rent');
  assert.equal(db[key]['way/1'].paidPrice,2400000);
  ctx.departed={ref:'way/1',rentableUnits:[{key:'way/1/f0/b50',tenantId:null,tenantName:null,status:'vacant'}]};
  await run("storeObservation({kind:'response',method:'GET',status:200,url:'https://play.capitalrift.com/api/building?ref=way%2F1',ts:1200,data:departed})");
  assert.equal(db[key]['way/1'].units['way/1/f0/b50'].tenantId,null,'newer explicit vacancy clears tenant');
  const content=fs.readFileSync(require('node:path').join(__dirname,'../content.js'),'utf8');
  const dashboard=fs.readFileSync(require('node:path').join(__dirname,'../dashboard.js'),'utf8');
  assert.match(content,/String\(r\.buildingRef\)\]\?\.units\?\.\[String\(r\.unitKey\)\]/,'shop join uses exact unitKey');
  assert.match(content,/Furnishing value is not a receipt or conversion cost/);
  assert.match(dashboard,/\$\{buildingUnitDetail\(a,r\)\}/,'full dashboard property detail includes observed units');
  assert.equal(db.crcc_observed_v4['/building?ref=way%2F1'].data.unitCount,1,'generic log stores only unit metadata');
  console.log('PASS: building/unit stable keys, partial and stale responses, tenant departure, exact shop join, no inferred conversion cost');
})().catch(e=>{console.error(e);process.exitCode=1;});
