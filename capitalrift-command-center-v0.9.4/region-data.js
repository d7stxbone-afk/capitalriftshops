/* Small read-only projections of observed CapitalRift region and shop history data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CRCCRegionData=api;})(typeof globalThis==='object'?globalThis:this,function(){
  const number=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const id=v=>v==null?'':String(v);
  function retail(raw,at=Date.now()){
    if(!raw||!/^\d+\/\d+\/\d+$/.test(id(raw.areaId))||!Array.isArray(raw.items)||!('goodsTotal' in raw))return null;
    const items=[];for(const x of raw.items){if(!x||!id(x.itemId))continue;items.push({itemId:id(x.itemId),commodity:x.commodity==null?null:id(x.commodity),soldPerMin:number(x.soldPerMin),sellersHere:number(x.sellersHere),sellersWorld:number(x.sellersWorld),bestAsk:number(x.bestAsk),base:number(x.base),optimal:number(x.optimal),wouldSellPerMin:number(x.wouldSellPerMin),opportunityPerMin:number(x.opportunityPerMin),fixture:x.fixture==null?null:id(x.fixture),playerMade:typeof x.playerMade==='boolean'?x.playerMade:null});}
    return{areaId:id(raw.areaId),shops:number(raw.shops),busyness:number(raw.busyness),wealth:number(raw.wealth),goodsListed:number(raw.goodsListed),goodsTotal:number(raw.goodsTotal),items,asOf:number(raw.asOf),observedAt:at};
  }
  function region(raw,at=Date.now()){
    if(!raw||!/^\d+\/\d+\/\d+$/.test(id(raw.areaId))||!id(raw.chunkId)||!('activityArea' in raw))return null;
    const renter=raw.rentersBrief||raw.renters;const activity=x=>x&&typeof x==='object'?Object.fromEntries(['businesses','owned','rooms','land','online'].map(k=>[k,number(x[k])])):null;
    return{areaId:id(raw.areaId),chunkId:id(raw.chunkId),lon:number(raw.lon),lat:number(raw.lat),busyness:number(raw.busyness),wealth:number(raw.wealth),urbanity:number(raw.urbanity),buildings:number(raw.buildings),activityChunk:activity(raw.activityChunk),activityArea:activity(raw.activityArea),rentersBrief:renter?{pool:number(renter.pool),housed:number(renter.housed),looking:number(renter.looking),listings:number(renter.listings),provisional:renter.provisional===true}:null,observedAt:at};
  }
  function history(raw,at=Date.now()){
    if(!raw||!id(raw.shopId)||!Array.isArray(raw.days))return null;
    const days=[];for(const d of raw.days){if(!d||number(d.day)==null)continue;const items={};for(const [key,pair] of Object.entries(d.items||{}))if(Array.isArray(pair))items[key]=[number(pair[0]),number(pair[1])];days.push({day:number(d.day),revenue:number(d.revenue),units:number(d.units),items});}
    return{shopId:id(raw.shopId),days,observedAt:at};
  }
  function historySummary(h,count=7){const days=(h?.days||[]).filter(d=>d.revenue!=null&&d.units!=null).sort((a,b)=>b.day-a.day).slice(0,count);const totals=new Map();for(const d of days)for(const [item,pair] of Object.entries(d.items||{}))totals.set(item,(totals.get(item)||0)+(pair[0]||0));return{days:days.length,averageRevenue:days.length?days.reduce((s,d)=>s+d.revenue,0)/days.length:null,averageUnits:days.length?days.reduce((s,d)=>s+d.units,0)/days.length:null,dominantItem:[...totals].sort((a,b)=>b[1]-a[1])[0]?.[0]||null};}
  function filterItems(items,{zeroSellers=false,playerMade='',fixture='',sort='opportunityPerMin'}={}){const allowed=new Set(['opportunityPerMin','wouldSellPerMin','soldPerMin','sellersHere','bestAsk','optimal']);const key=allowed.has(sort)?sort:'opportunityPerMin';return (items||[]).filter(x=>(!zeroSellers||x.sellersHere===0)&&(playerMade===''||String(x.playerMade)===playerMade)&&(!fixture||x.fixture===fixture)).sort((a,b)=>(b[key]??-Infinity)-(a[key]??-Infinity)||a.itemId.localeCompare(b.itemId));}
  return{retail,region,history,historySummary,filterItems};
});
