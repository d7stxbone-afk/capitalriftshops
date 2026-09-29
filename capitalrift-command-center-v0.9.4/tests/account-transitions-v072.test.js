const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),R=require('../region-data.js'),db={};
const ctx=vm.createContext({URL,Date,console,CRCCRegionData:R,chrome:{storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,db[k]])),set:async rows=>Object.assign(db,rows)}}}});
vm.runInContext(src.slice(0,src.indexOf('async function recordHistory(')),ctx);
vm.runInContext(src.slice(src.indexOf('async function refreshData('),src.indexOf('function scoutRoomSummary(')),ctx);
vm.runInContext(src.slice(src.indexOf('async function storeObservation('),src.indexOf('async function saveShopHealth(')),ctx);
vm.runInContext(src.slice(src.indexOf('async function verifiedReadAccount('),src.indexOf('// ---- 5-minute automatic refresh ----')),ctx);
ctx.scoutAnchor=x=>x;ctx.recordHistory=async()=>{};ctx.updatePropertyBuyers=async()=>{};ctx.mergeMarketIntel=async()=>{};
let me={playerId:'person',piloting:{companyId:'co',name:'Co',perms:63}},partial=false,failOptional=false;
const company={playerId:'co',cash:2000,netWorth:9999,shops:[{id:'shop-co',name:'Gross 1',buildingRef:'way/1',grossPerMin:3}],assets:[{id:'way/1',kind:'property',label:'Offices',value:4000},{id:'land/1',kind:'land',value:10}],landHoldings:[{id:'land/1',chunkId:'15/1/1'}],propertyAnchors:[{ref:'way/1',lon:1,lat:2}]};
ctx.gameGet=async p=>{if(p==='/me')return me;if(p==='/company/mine')return{companies:[{id:'co',name:'Co'}]};if(p==='/game/co/shop-history?shopId=shop-co')return{shopId:'shop-co',days:[{day:1,revenue:2,units:3,items:{a:[3,4]}}]};if(p==='/game/person')return{playerId:'person',shops:[{id:'person-shop',name:'Own',grossPerMin:1}]};if(p==='/game/co')return partial?{playerId:'co',cash:2500,sectionsUnchanged:['shops','assets','propertyAnchors','landHoldings']}:company;if(p==='/company/co/equity'){if(failOptional)throw Error('optional');return{status:'listed',listed:{},bookValue:9999};}if(p==='/company/co/members'){if(failOptional)throw Error('optional');return{members:[]};}throw Error('optional');};
(async()=>{
 let x=await vm.runInContext('refreshData()',ctx);assert.equal(x.accounts.company.counts.shops,1);assert.equal(x.diagnostics.publicCompany,'listed');
 me={playerId:'person',piloting:null};x=await vm.runInContext('refreshData()',ctx);assert.equal(x.accounts.company.id,'co');assert.equal(x.identity.pilotedCompanyId,null);assert.equal(x.diagnostics.companyOperationalFeed,'cached');assert.equal(x.accounts.character.income.sources.shops.rows[0].id,'person-shop');
 partial=true;failOptional=true;for(let i=0;i<3;i++){me={playerId:'person',piloting:{companyId:'co',perms:63}};x=await vm.runInContext('refreshData()',ctx);assert.equal(x.accounts.company.cash,2500);assert.equal(x.accounts.company.income.sources.shops.rows[0].id,'shop-co');assert.equal(x.accounts.company.assetInventory.buildings.length,1);assert.equal(x.accounts.company.assetInventory.land.length,1);assert.equal(x.accounts.company.properties.find(p=>p.ref==='way/1').lat,2);assert.equal(x.accounts.character.income.sources.shops.rows[0].id,'person-shop');me={playerId:'person',piloting:null};x=await vm.runInContext('refreshData()',ctx);assert.equal(x.accounts.company.counts.shops,1);}
 const latest=db.crcc_snapshot_v4;assert.equal(latest.identity.availableCompanies[0].id,'co');
 await vm.runInContext("storeObservation({kind:'response',method:'GET',status:200,url:'https://play.capitalrift.com/api/game/co/retail',ts:1000,data:{areaId:'12/946/1652',goodsTotal:1,items:[{itemId:'a',sellersHere:0,bestAsk:null}]}})",ctx);
 await vm.runInContext("storeObservation({kind:'response',method:'GET',status:200,url:'https://play.capitalrift.com/api/game/co/retail',ts:900,data:{areaId:'12/946/1652',goodsTotal:1,items:[{itemId:'a',sellersHere:9}]}})",ctx);
 assert.equal(db.crcc_region_intel_v1['co:12/946/1652'].items[0].sellersHere,0);
 await vm.runInContext("storeObservation({kind:'response',method:'GET',status:200,url:'https://play.capitalrift.com/api/game/co/shop-history?shopId=shop-co',ts:1100,data:{shopId:'shop-co',days:[{day:2,revenue:7,units:1,items:{a:[1,8]}}]}})",ctx);
 assert.equal(db.crcc_shop_history_v1['co:shop-co'].days.length,1);
 me={playerId:'person',piloting:{companyId:'co'}};const loaded=await vm.runInContext('loadShopHistory("co","shop-co","company")',ctx);assert.equal(loaded.days[0].units,3);
 await assert.rejects(vm.runInContext('loadShopHistory("person","shop-co","character")',ctx),/matching account/);assert.equal(db.crcc_observed_v4?.['/game/co/shop-history?shopId=shop-co'],undefined);
 console.log('PASS: repeated pilot/unpilot transitions, cached company and separate personal roster, partial estate sections, optional profile errors, scoped/stale region and history cache');
})().catch(e=>{console.error(e);process.exitCode=1});
