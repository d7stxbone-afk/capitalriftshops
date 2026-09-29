const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {plan}=require('../rename-plan.js');
const {derive}=require('../shop-metrics.js');
const src=fs.readFileSync(require('node:path').join(__dirname,'../background.js'),'utf8');
const ctx=vm.createContext({URL,Date,console});
vm.runInContext(src.slice(0,src.indexOf('async function recordHistory(')),ctx);
vm.runInContext(src.slice(src.indexOf('function objectWalk('),src.indexOf('async function storeObservation(')),ctx);
const run=(expression)=>vm.runInContext(expression,ctx);
const rows=[{shopId:'a',name:'Gross 106',grossPerMin:1},{shopId:'b',name:'Gross 107',grossPerMin:9},{shopId:'c',name:'Gross 107',grossPerMin:5},{shopId:'d',name:'Unassigned',grossPerMin:2},{shopId:'e',name:'Gross 110',grossPerMin:3}];
let result=plan(rows,'Gross {n}',1);assert.deepEqual(result.changes.map(x=>[x.id,x.newName]),[['shopId:c','Gross 111'],['shopId:d','Gross 112']]);
assert.equal(result.skipped,3);
const persisted=Object.fromEntries(rows.filter(r=>/^Gross (106|107|110)$/.test(r.name)&&r.shopId!=='c').map(r=>[`shopId:${r.shopId}`,Number(r.name.slice(6))]));
for(const change of result.changes){change.shop.name=change.newName;persisted[change.id]=change.assignedNumber;}
result=plan([...rows].reverse(),'Gross {n}',1,persisted);assert.equal(result.changes.length,0,'second run and reorder produce no changes');
const fresh={shopId:'f',name:'New',grossPerMin:100};result=plan([fresh,...rows],'Gross {n}',1,persisted);assert.deepEqual(result.changes.map(x=>x.newName),['Gross 113']);
assert.equal(plan([{name:'No ID'},...rows],'Gross {n}',1,persisted).unresolved,1);
assert.equal(plan([{shopId:'a',name:'Gross 106'},{shopId:'a',name:'New'}],'Gross {n}',1,persisted).unresolved,2);
const noGap=plan([{shopId:'a',name:'Gross 106'},{shopId:'g',name:'Gross 109'},{shopId:'h',name:'New'}],'Gross {n}',1);assert.equal(noGap.changes[0].newName,'Gross 110');
// Shape observed in the actual /api/game/:id response: `property` means
// a building deed, and each `parcel/<uuid>` refers to landHoldings[].id.
ctx.realShape={assets:[
  {id:'parcel/parcel-a',kind:'land',label:'Land parcel',detail:'100 m2',value:12},
  {id:'parcel/parcel-b',kind:'land',label:'Land parcel',detail:'200 m2',value:13},
  {id:'way/101',kind:'property',label:'Offices',detail:'2 floors',value:30},
  {id:'way/102',kind:'property',label:'Offices',detail:'3 floors',value:40}
],landHoldings:[{id:'parcel-a',chunkId:'15/1/1',buildings:[]},{id:'parcel-b',chunkId:'15/1/2',buildings:[]}]};
const realInventory=run('extractOfficialAssetInventory(realShape)');
assert.deepEqual(JSON.parse(JSON.stringify([realInventory.land.length,realInventory.buildings.length,realInventory.rooms.length])),[2,2,0]);
assert.equal(realInventory.land.reduce((sum,x)=>sum+x.value,0),25);
assert.equal(realInventory.buildings.reduce((sum,x)=>sum+x.value,0),70);
// Simulate the official menu: duplicated generic labels are distinct assets by ID.
const menu={at:Date.now(),accountId:'player1',data:{sections:[
 {title:'Land',items:[{parcelId:'L1',name:'Parcel',appraisedValue:12},{parcelId:'L2',name:'Parcel',appraisedValue:13}]},
 {title:'Buildings',items:[{buildingRef:'B1',name:'Offices',appraisedValue:30},{buildingRef:'B2',name:'Offices',appraisedValue:40}]},
 {title:'Rooms',items:[{roomId:'R1',name:'Offices',appraisedValue:5}]}
]}};
ctx.fixture={'player1:/assets':menu};
let inv=run("extractObservedAssetInventory(fixture,'player1')");
assert.deepEqual(JSON.parse(JSON.stringify([inv.land.length,inv.buildings.length,inv.rooms.length])),[2,2,1]);
assert.equal(inv.buildings[0].label,'Offices');assert.equal(inv.rooms[0].label,'Offices');
ctx.base={landHoldings:[{parcelId:'L1',name:'Parcel',buildings:[{id:'B1',name:'Offices',purchasePrice:30}]}],ownedRooms:[{roomId:'R1',name:'Offices',purchasePrice:5}]};
inv=run("mergeAssetInventories(extractObservedAssetInventory(fixture,'player1'),extractOfficialAssetInventory(base))");
assert.deepEqual(JSON.parse(JSON.stringify([inv.land.length,inv.buildings.length,inv.rooms.length])),[2,2,1]);
ctx.inv=inv;const worth=run("classifyNetWorth([{key:'cash',label:'Cash',value:10}],[],100,inv)");
assert.equal(worth.realEstate.land,25);assert.equal(worth.realEstate.buildings,70);assert.equal(worth.realEstate.rooms,5);
ctx.fixture={'player1:/assets/buildings':{at:Date.now()-100,accountId:'player1',data:{assets:{buildings:[{buildingRef:'B1',name:'Offices',value:30},{buildingRef:'B2',name:'Offices',value:40}]}}},'player1:/assets/other':{at:Date.now(),accountId:'player1',data:{assets:{land:[{parcelId:'L2',value:13}],rooms:[{roomId:'R1',value:5}]}}},'other:/assets':{at:Date.now(),accountId:'other',data:{assets:{land:[{parcelId:'WRONG',value:999}]}}}};
inv=run("mergeAssetInventories(extractObservedAssetInventory(fixture,'player1'),extractOfficialAssetInventory(base))");
assert.deepEqual(JSON.parse(JSON.stringify([inv.land.length,inv.buildings.length,inv.rooms.length])),[2,2,1]);
ctx.fixture={'player1:/assets':menu,'player1:/assets/copy':{...menu,at:Date.now()-1}};
inv=run("extractObservedAssetInventory(fixture,'player1')");assert.deepEqual(JSON.parse(JSON.stringify([inv.land.length,inv.buildings.length,inv.rooms.length])),[2,2,1]);
ctx.inv={land:[],buildings:[{id:'buildingRef:B1',label:'Offices',value:30}],rooms:[]};
const partialWorth=run("classifyNetWorth([{key:'landValue',label:'Land',value:12}],[],42,inv)");assert.equal(partialWorth.realEstate.land,12);assert.equal(partialWorth.realEstate.buildings,30);
ctx.fixture={'player1:/assets':{at:Date.now(),accountId:'player1',data:{assets:[{assetType:'building',id:'B3',name:'Offices',value:17},{category:'room',roomId:'R2',name:'Offices',value:3}]}}};
inv=run("extractObservedAssetInventory(fixture,'player1')");assert.deepEqual(JSON.parse(JSON.stringify([inv.land.length,inv.buildings.length,inv.rooms.length])),[0,1,1]);
ctx.fixture={'player1:/assets/buildings':{at:Date.now(),accountId:'player1',data:[{id:'B4',name:'Offices',value:19},{id:'B5',name:'Offices',value:20}]}};
inv=run("extractObservedAssetInventory(fixture,'player1')");assert.equal(inv.buildings.length,2);
ctx.game={shops:[{shopId:'x',name:'Same'},{shopId:'y',name:'Same'}]};ctx.income={sources:{shops:[{shopId:'y',name:'Same',grossPerMin:8},{shopId:'x',name:'Same',grossPerMin:4}]}};
const shops=run('accountShopRows(game,income)');assert.equal(shops.length,2);assert.equal(shops[0].shopId,'x');assert.equal(shops[0].grossPerMin,4);assert.equal(shops[1].grossPerMin,8);
ctx.supply={summary:{lanes:0,coverage:1,unsupplied:2,vehiclesNeeded:0},requests:[{toUnitKey:'unit-a',itemId:'nails',reason:'no_supplier',want:6,onHand:0},{toUnitKey:'unit-ambiguous',itemId:'wood',reason:'no_supplier'}],endpoints:[{kind:'room',unitKey:'unit-a'}]};
ctx.supplyShops=[{id:'shop-a',unitKey:'unit-a'},{id:'shop-b',unitKey:'unit-b'},{id:'shop-c',unitKey:'unit-ambiguous'},{id:'shop-d',unitKey:'unit-ambiguous'}];
const supply=run('normalizeLogistics(supply,supplyShops)');assert.equal(supply.summary.unsupplied,2);assert.equal(supply.requests[0].shopId,'shop-a');assert.equal(supply.requests[1].shopId,null);
assert.equal(run('normalizeLogistics(null,[],{unsupplied:3}).summary.unsupplied'),3);
ctx.game={shops:[{id:'state-a',unitKey:'unit-a',name:'Gross 106',grossPerMin:5},{id:'state-b',unitKey:'unit-b',name:'Gross 107',grossPerMin:6}]};
ctx.income={sources:{shops:[{id:'income-a',businessKey:'different-a',unitKey:'unit-a',name:'Gross 106',grossPerMin:10},{id:'income-b',businessKey:'different-b',name:'Gross 107',grossPerMin:20}]}};
let canonical=run('accountShopRows(game,income)');assert.equal(canonical.length,2);assert.deepEqual(JSON.parse(JSON.stringify(canonical.map(x=>[x.id,x.grossPerMin]))),[['state-a',5],['state-b',6]],'structured shops take priority over supplementary income');
ctx.income={sources:{shops:[{id:'unrelated-a',name:'Other A',grossPerMin:99},{id:'unrelated-b',name:'Other B',grossPerMin:99}]}};
canonical=run('accountShopRows(game,income)');assert.equal(canonical.length,2,'unmatched income rows do not double the count');
ctx.game={shops:[]};canonical=run('accountShopRows(game,income)');assert.equal(canonical.length,0,'explicit empty inventory is authoritative');
ctx.game={};canonical=run('accountShopRows(game,income)');assert.equal(canonical.length,2,'income-only fallback remains for omitted shops');
ctx.rentResponse={markets:[{regionId:'12/1192/1551',pool:1800,housed:1665,looking:135,listings:9280,yours:0,provisional:false,types:[{type:'shop',pool:216,looking:0,listings:682,yours:0},{type:'office',pool:144,looking:0,listings:4005,yours:0}]}]};
ctx.rentRows=run("extractRentMarkets(rentResponse,1000,'company-a')");
assert.equal(ctx.rentRows[0].types[0].listings,682);
ctx.savedRent=run('mergeRentMarkets({},rentRows)');
ctx.partial=run("extractRentMarkets({markets:[{regionId:'12/1192/1551',types:[{type:'shop',listings:700}]}]},2000,'company-a')");
ctx.savedRent=run('mergeRentMarkets(savedRent,partial)');
assert.equal(ctx.savedRent['company-a:12/1192/1551'].pool,1800);
assert.equal(ctx.savedRent['company-a:12/1192/1551'].types.find(t=>t.type==='shop').pool,216);
assert.equal(ctx.savedRent['company-a:12/1192/1551'].types.find(t=>t.type==='shop').listings,700);
assert.equal(ctx.savedRent['company-a:12/1192/1551'].types.find(t=>t.type==='office').listings,4005);
ctx.savedRent=run('mergeRentMarkets(savedRent,rentRows)');
assert.equal(ctx.savedRent['company-a:12/1192/1551'].types.find(t=>t.type==='shop').listings,700,'stale observation cannot overwrite newer market data');
ctx.secondAccount=run("extractRentMarkets(rentResponse,1500,'company-b')");ctx.savedRent=run('mergeRentMarkets(savedRent,secondAccount)');
assert.equal(Object.keys(ctx.savedRent).length,2,'regional market observations stay scoped to the correct account');
assert.equal(run("extractRentMarkets({markets:[{regionId:'bad',pool:null,types:[]}]},3000,'company-a')[0].pool"),null,'missing metrics remain unknown');
assert.equal(run("Object.keys(mergeRentMarkets(savedRent,extractRentMarkets(rentResponse,3000,null))).length"),2,'unscoped response is ignored');
ctx.daily={days:30,bucket:'day',rows:[{t:86400000,kind:'sale',inflow:100,outflow:0},{t:86400000,kind:'property',inflow:0,outflow:40},{t:172800000,kind:'sale',inflow:200,outflow:0}]};
ctx.hourly={days:2,bucket:'hour',rows:[{t:172800000,kind:'sale',inflow:30,outflow:0},{t:176400000,kind:'wage',inflow:0,outflow:12}]};
ctx.history=run('summarizeHistory(daily,hourly)');
ctx.cash24=run("cashflowForRange(history,'24h',180000000)");
assert.equal(ctx.cash24.bucket,'hour');assert.equal(ctx.cash24.inflow,30);assert.equal(ctx.cash24.outflow,12);
ctx.cash7=run("cashflowForRange(history,'7d',180000000)");
assert.equal(ctx.cash7.bucket,'day');assert.equal(ctx.cash7.inflow,300);assert.equal(ctx.cash7.outflow,40);
assert.equal(ctx.cash7.byKind.find(x=>x.kind==='property').outflow,40,'capital purchase stays a distinct transaction type');
assert.equal(run("cashflowForRange(summarizeHistory(daily),'24h',180000000).rangeLabel"),'Current UTC day','missing hourly response falls back to a calendar day, not a claimed rolling 24h');
assert.equal(run("cashflowForRange(summarizeHistory({rows:[]}), '7d', 180000000).count"),0,'empty history produces an honest empty period');
const metric=derive({grossPerMin:774.54,costPerMin:396.61,wagePerMin:4.41,appeal:59,checkoutUsedPerMin:192.53,checkoutRatePerMin:288,customersPerMin:18.21,salesPerMin:48.13,busyness:2.29},{},2);
assert.equal(metric.appealGrade,59);assert.ok(Math.abs(metric.registerBusy-66.85)<.01);assert.equal(metric.customersPerMin,18.21);assert.equal(metric.salesPerRestocker,24.065);assert.ok(Math.abs(metric.gameNetPerMin-373.52)<.001);
const pictured=derive({grossPerMin:1006.35,costPerMin:510.17,wagePerMin:5.68,appeal:79,checkoutUsedPerMin:247.66,checkoutRatePerMin:288,customersPerMin:21.57,salesPerMin:61.91,busyness:2.41});
assert.ok(Math.abs(pictured.gameNetPerMin-490.50)<.001);assert.equal(pictured.appealGrade,79);assert.ok(Math.abs(pictured.registerBusy-86)<.02);assert.equal(pictured.customersPerMin,21.57);
assert.equal(derive({checkoutUsedPerMin:null,checkoutRatePerMin:288,appeal:null,salesPerMin:null},{},2).registerBusy,null,'missing checkout data is not zero');
assert.equal(derive({appeal:59},{appealGrade:63}).appealGrade,59,'structured appeal takes priority over old panel text');
ctx.furn={furniture:[
  {id:'piece-a',buildingRef:'way/101',sale:{shopId:'shop-a',qty:0}},{id:'piece-b',buildingRef:'way/101',sale:{shopId:'shop-a',qty:4}},
  {id:'piece-c',buildingRef:'way/101',sale:{shopId:'shop-b',qty:2}},{id:'piece-c',buildingRef:'way/101',sale:{shopId:'shop-b',qty:2}},
  {id:'piece-d',buildingRef:'way/101',sale:{shopId:'other-player',qty:0}}
]};
ctx.stock=run('extractShopStock(furn,1000)');assert.equal(ctx.stock.find(x=>x.shopId==='shop-a').emptyShelves,1);
assert.equal(ctx.stock.find(x=>x.shopId==='shop-b').shelves,1,'duplicate furniture IDs count once');
ctx.accounts=[{id:'company-a',income:{sources:{shops:{rows:[{id:'shop-a',buildingRef:'way/101'},{id:'shop-b',buildingRef:'way/101'}]}}}}];
ctx.savedStock=run('mergeShopStock({},stock,accounts)');assert.equal(Object.keys(ctx.savedStock).length,2,'other players stock is excluded');
ctx.partialStock=run("extractShopStock({furniture:[{id:'piece-a',buildingRef:'way/101',sale:{shopId:'shop-a',qty:0}}]},2000)");
ctx.savedStock=run('mergeShopStock(savedStock,partialStock,accounts)');assert.equal(ctx.savedStock['company-a:shop-a'].shelves,2,'partial furniture response keeps the more complete capture');
assert.equal(run('finite(null)'),false,'missing values stay unknown across analytics and geolocation');
console.log('PASS: Gross numbering, asset reconciliation, canonical shops, logistics, rental observations, cashflow, official shop health metrics, partial scoped furniture, missing-value handling');
