const assert=require('node:assert/strict');
const R=require('../region-data.js');
const raw={areaId:'12/946/1652',shops:234,busyness:2.101,wealth:1.034,goodsListed:126,goodsTotal:329,items:[
 {itemId:'a',commodity:'A',soldPerMin:0,sellersHere:0,sellersWorld:107,bestAsk:null,base:1,optimal:2,wouldSellPerMin:.018,opportunityPerMin:19.05,fixture:'platform',playerMade:false},
 {itemId:'b',soldPerMin:4,sellersHere:3,wouldSellPerMin:1,opportunityPerMin:2,fixture:'shelf',playerMade:true},
 {itemId:'c',soldPerMin:2,sellersHere:0,wouldSellPerMin:3,opportunityPerMin:4,fixture:'shelf',playerMade:true}]};
const r=R.retail(raw,100);assert.equal(r.areaId,raw.areaId);assert.equal(r.shops,234);assert.equal(r.goodsTotal,329);assert.equal(r.busyness,2.101);assert.equal(r.wealth,1.034);assert.equal(r.items[0].bestAsk,null);assert.equal(r.items[0].sellersHere,0);
assert.deepEqual(R.filterItems(r.items,{zeroSellers:true}).map(x=>x.itemId),['a','c']);
assert.deepEqual(R.filterItems(r.items,{playerMade:'true',fixture:'shelf',sort:'soldPerMin'}).map(x=>x.itemId),['b','c']);
assert.deepEqual(R.filterItems(r.items,{sort:'wouldSellPerMin'}).map(x=>x.itemId),['c','b','a']);
assert.deepEqual(R.filterItems(r.items,{sort:'sellersHere'}).map(x=>x.itemId),['b','a','c']);
assert.equal(R.retail({...raw,wealth:undefined},100).wealth,null);
const region=R.region({areaId:raw.areaId,chunkId:'15/7573/13222',lon:-96.79676,lat:32.78062,busyness:2,wealth:1.034,activityArea:{businesses:240,rooms:851},rentersBrief:{pool:1800,housed:1696,looking:104}},101);
assert.equal(region.activityArea.rooms,851);assert.equal(region.rentersBrief.looking,104);assert.equal(region.activityChunk,null);
const history=R.history({shopId:'stable-1',days:[{day:121,revenue:200,units:10,items:{a:[10,239.5]}},{day:122,revenue:400,units:20,items:{b:[20,370]}},{day:124,revenue:null,units:null,items:{}}]},102);
assert.equal(history.days.length,3);assert.deepEqual(history.days[0].items.a,[10,239.5]);assert.equal(R.historySummary(history).averageRevenue,300);assert.equal(R.historySummary(history).averageUnits,15);assert.equal(R.historySummary(history).dominantItem,'b');
console.log('PASS: structured Retail Intel nullable/zero fields, filters and sorts, compact Region Info, variable shop-history days and averages');
