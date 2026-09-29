const assert=require('node:assert/strict');
const fs=require('node:fs');
const A=require('../intel-advisory.js');
const R=require('../region-data.js');
const area=R.retail({areaId:'12/1/1',shops:30,busyness:2.2,wealth:1.4,goodsListed:4,goodsTotal:9,items:[
  {itemId:'zero',sellersHere:0,wouldSellPerMin:4,opportunityPerMin:8,soldPerMin:2,bestAsk:null,optimal:10,fixture:'platform',playerMade:true},
  {itemId:'low',sellersHere:2,wouldSellPerMin:7,opportunityPerMin:5,soldPerMin:5,fixture:'shelf',playerMade:false},
  {itemId:'active',sellersHere:8,wouldSellPerMin:10,opportunityPerMin:3,soldPerMin:12,fixture:'shelf',playerMade:true},
  {itemId:'unknown',sellersHere:null,wouldSellPerMin:null,opportunityPerMin:null,soldPerMin:null,bestAsk:null,fixture:'shelf',playerMade:null}
]},100);
assert.deepEqual(A.gaps(area).map(x=>x.itemId),['zero','low']);
assert.deepEqual(A.gaps(area,{zero:true,maxSellers:null,minOpportunity:null}).map(x=>x.itemId),['zero']);
assert.deepEqual(A.gaps(area,{maxSellers:1,minOpportunity:0}).map(x=>x.itemId),['zero']);
assert.deepEqual(A.gaps(area,{maxSellers:10,minOpportunity:5}).map(x=>x.itemId),['zero','low']);
assert.deepEqual(A.gaps(area,{maxSellers:10,minOpportunity:0,minWouldSell:8}).map(x=>x.itemId),['active']);
assert.deepEqual(A.gaps(area,{maxSellers:10,minOpportunity:0,minSold:6}).map(x=>x.itemId),['active']);
assert.deepEqual(A.gaps(area,{maxSellers:10,minOpportunity:0,sort:'wouldSellPerMin'}).map(x=>x.itemId),['active','low','zero']);
assert.deepEqual(A.gaps(area,{maxSellers:10,minOpportunity:0,playerMade:'false'}).map(x=>x.itemId),['low']);
assert.deepEqual(A.gaps(area,{maxSellers:10,minOpportunity:0,fixture:'platform'}).map(x=>x.itemId),['zero']);
assert.equal(A.gaps(area)[0].demandPerSeller,4);
assert.equal(A.gaps(area,{maxSellers:null,minOpportunity:null}).find(x=>x.itemId==='unknown').demandPerSeller,null);

const mk=(day,revenue,units)=>({day,revenue,units});
const dropping={days:[...Array.from({length:7},(_,i)=>mk(20-i,70,35)),...Array.from({length:7},(_,i)=>mk(13-i,100,50))]};
const t=A.trend(dropping,15,area);assert.equal(t.revenue.current,70);assert.equal(t.revenue.previous,100);assert.equal(t.revenue.percent,-30);assert.equal(t.units.percent,-30);assert.deepEqual(t.alerts,['REVENUE DROP','UNIT DROP']);assert.match(t.regionContext,/observed region demand data includes positive estimates/);assert.equal(t.regionBusyness,2.2);assert.equal(t.regionWealth,1.4);
assert.deepEqual(A.trend(dropping,40,null).alerts,[]);
assert.equal(A.trend(dropping,15,null).regionContext,null);
const rising={days:[...Array.from({length:7},(_,i)=>mk(20-i,120,60)),...Array.from({length:7},(_,i)=>mk(13-i,100,50))]};assert.deepEqual(A.trend(rising).alerts,['REVENUE IMPROVEMENT','UNIT IMPROVEMENT']);
assert.equal(A.trend({days:[mk(2,100,10)]}).revenue.percent,null);
assert.equal(A.trend({days:[mk(3,10,2),mk(2,0,0)]}).revenue.percent,null);
assert.equal(A.trend({days:[mk(4,10,null),mk(3,9,2),mk(2,5,1)]}).units.currentDays,2);
assert.equal(A.trend({days:[mk(5,10,1),mk(5,999,999),mk(4,10,1)]}).revenue.currentDays,2);

const newer=R.retail({areaId:'12/1/1',shops:2,busyness:3,wealth:2,goodsListed:1,goodsTotal:2,items:[{itemId:'x',sellersHere:0,opportunityPerMin:6,wouldSellPerMin:null},{itemId:'y',sellersHere:null,opportunityPerMin:null,wouldSellPerMin:0}]},200);
const other=R.retail({areaId:'12/1/2',shops:5,busyness:null,wealth:4,goodsListed:0,goodsTotal:3,items:[]},150);
const retailCache={'p:12/1/1':area,'observed:12/1/1':newer,'p:12/1/2':other,'c:12/2/2':area};
const info={'p:12/1/1':R.region({areaId:'12/1/1',chunkId:'15/1/1',lon:2,lat:3,urbanity:0.5,activityArea:{businesses:2}},300)};
const cards=A.cards(retailCache,info,'p');assert.equal(cards.length,2);const c=cards.find(x=>x.areaId==='12/1/1');assert.equal(c.busyness,3);assert.equal(c.zeroSellerCount,1);assert.equal(c.positiveOpportunityCount,1);assert.equal(c.maxOpportunity,6);assert.equal(c.avgPositiveOpportunity,6);assert.equal(c.maxWouldSell,0);assert.equal(c.lon,2);assert.equal(c.regionInfo.urbanity,0.5);
assert.equal(A.sortCards(cards,'busyness')[0].areaId,'12/1/1');assert.equal(A.sortCards(cards,'wealth')[0].areaId,'12/1/2');assert.equal(A.scorecard(other).avgPositiveOpportunity,null);
assert.equal(A.scorecard(area).maxOpportunity,8);assert.equal(A.scorecard(newer).maxOpportunity,6,'new observation invalidates derived area statistics');

assert.deepEqual(A.products(area,{mode:'opportunity'}).slice(0,3).map(x=>x.itemId),['zero','low','active']);
assert.deepEqual(A.products(area,{mode:'estimated'}).slice(0,3).map(x=>x.itemId),['active','low','zero']);
assert.deepEqual(A.products(area,{mode:'competition'}).slice(0,3).map(x=>x.itemId),['zero','low','active']);
const balanced=A.products(area,{mode:'balanced'});assert.equal(balanced.length,4);assert(balanced.every((x,i)=>i===3||x.fitScore!==null));assert.equal(balanced.at(-1).fitScore,null);assert.match(A.FORMULA,/40% opportunity percentile/);assert.match(A.FORMULA,/renormalized/);
assert.deepEqual(A.products(area,{fixture:'platform'}).map(x=>x.itemId),['zero']);
assert.deepEqual(A.products(area,{playerMade:'false'}).map(x=>x.itemId),['low']);
assert.equal(A.products(area,{mode:'balanced',fixture:'platform'})[0].fitScore,balanced.find(x=>x.itemId==='zero').fitScore,'fixture filter must not shift full-area percentile');
assert.equal(A.products(area,{mode:'balanced'}),balanced,'repeat same-area ranking reuses memoized projection');
assert.equal(A.products(newer,{mode:'balanced'}).length,2,'new response recomputes ranking');
const map={'character:p:s':{areaId:'12/1/1',buildingRef:'way/1',lat:3,lon:2}};
assert.equal(A.shopArea({shopId:'s',buildingRef:'way/1',lat:3,lon:2},{kind:'character',id:'p'},map),'12/1/1');
assert.equal(A.shopArea({shopId:'s',buildingRef:'way/1',lat:4,lon:2},{kind:'character',id:'p'},map),null);
assert.equal(A.shopArea({shopId:'s',buildingRef:'way/2'},{kind:'character',id:'p'},map),null);
assert.equal(A.shopArea({shopId:'s',buildingRef:'way/1'},{kind:'company',id:'c'},map),null);
assert.equal(A.shopArea({shopId:'s',areaId:'12/9/9'},{kind:'character',id:'p'},map),'12/9/9');
const content=fs.readFileSync(require('node:path').join(__dirname,'../content.js'),'utf8');assert.match(content,/data-shop-id="\$\{esc\(r.id\)\}"[^>]*>Products/);assert.match(content,/renderProductFinder\(a,rows\)/);assert.match(content,/kind:'loadRegionInfo',scope:a.kind,accountId:a.id,lon,lat/);
console.log('PASS: competition gaps, trend alerts, scorecards, product ranking/cache, stable shop area and UI integration');
