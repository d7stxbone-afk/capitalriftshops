const assert=require('node:assert/strict');
const buyer=require('../land-buyer.js');

const land=(ref,price,area,traffic=1.5,extra={})=>({
  ref,entityType:'land',source:'observed-game-land',areaM2:area,busyness:traffic,
  listing:{kind:'sale',forSale:true,price},...extra
});
const a=land('parcel/a',100,10,1.2),b=land('parcel/b',200,40,2.5),c=land('parcel/c',50,5,3);
assert.equal(buyer.eligible(a),true);
assert.equal(buyer.eligible({...a,source:'map-lead'}),false,'external leads cannot be bought');
assert.equal(buyer.eligible({...a,listing:null}),false,'unlisted land cannot be bought');
const unresolved={ref:'78021580-7110-8325-bce1-800280040000',entityType:'land',source:'observed-game-land',areaM2:8898.999,value:2125,owner:null,listing:null};
assert.equal(buyer.candidate(unresolved),true,'a real game parcel remains selectable with unknown owner and offer');
assert.equal(buyer.eligibility(unresolved).state,'needs-details');
assert.equal(buyer.candidate({...unresolved,source:'map-lead'}),false,'external and synthetic leads are never candidates');
assert.equal(buyer.eligibility({...unresolved,myOwned:true}).state,'already-owned');
assert.equal(buyer.eligibility({...unresolved,listing:{forSale:false}}).state,'not-purchasable');
assert.equal(buyer.plan([unresolved],{selectedIds:[unresolved.ref]}).queue.length,0,'selection alone never authorizes a purchase');
assert.equal(buyer.eligible({...a,myOwned:true}),false,'owned land cannot be bought');
assert.equal(buyer.price({...a,listing:{kind:'sale',forSale:true,price:null},purchasePrice:null,value:999}),null,'appraisal/value cannot masquerade as a sale price');
assert.equal(buyer.plan([a,b],{selectedIds:[]}).queue.length,0,'empty selection means buy nothing');
assert.equal(buyer.plan([{...a,listing:{kind:'sale',forSale:true,price:null},purchasePrice:null}],{selectedIds:['parcel/a']}).queue.length,0,'unknown sale price never enters an executable batch');
assert.deepEqual(buyer.plan([a,b,c],{selectedIds:['parcel/a','parcel/c'],strategy:'cheapest'}).queue.map(x=>x.ref),['parcel/c','parcel/a']);
assert.deepEqual(buyer.plan([a,b,c],{selectedIds:['parcel/a','parcel/b','parcel/c'],strategy:'largest'}).queue.map(x=>x.ref),['parcel/b','parcel/a','parcel/c']);
assert.deepEqual(buyer.plan([a,b,c],{selectedIds:['parcel/a','parcel/b','parcel/c'],strategy:'pricePerM2'}).queue.map(x=>x.ref),['parcel/b','parcel/a','parcel/c']);
const budget=buyer.plan([a,b,c],{selectedIds:['parcel/a','parcel/b','parcel/c'],strategy:'cheapest',maxSpend:160,maxParcels:5});
assert.deepEqual(budget.queue.map(x=>x.ref),['parcel/c','parcel/a']);assert.equal(budget.totalPrice,150);
const capped=buyer.plan([a,b,c],{selectedIds:['parcel/a','parcel/b','parcel/c'],maxParcels:1});assert.equal(capped.queue.length,1);
const dup=buyer.plan([a,{...a},b],{selectedIds:['parcel/a','parcel/b']});assert.deepEqual(dup.queue.map(x=>x.ref),['parcel/a','parcel/b']);
console.log('PASS: mass land selection requires explicit stable IDs, game sale listings, safe price sources, dedupe, budget and max-count limits');
