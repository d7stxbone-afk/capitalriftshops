/* Pure helpers for Capital Rift land batch selection. No network or game writes. */
(function(root){
  const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const idOf=p=>p?.ref!=null?String(p.ref):p?.id!=null?String(p.id):p?.parcelId!=null?String(p.parcelId):null;
  function listingForSale(p){const l=p?.listing;return !!(l&&typeof l==='object'&&(l.forSale===true||String(l.kind||'').toLowerCase()==='sale'||String(l.type||'').toLowerCase()==='sale'));}
  function price(p){const live=n(p?.listing?.price);return live!==null?live:n(p?.purchasePrice);}
  function priceSource(p){if(n(p?.listing?.price)!==null)return'listing';if(n(p?.purchasePrice)!==null)return'purchase';return'unknown';}
  function candidate(p){const id=idOf(p);return !!(id&&id.length<=120&&p?.entityType==='land'&&p?.source==='observed-game-land');}
  function eligibility(p){if(!candidate(p))return{state:'unavailable',reason:'Not a confirmed CapitalRift land parcel.'};
    if(p.myOwned===true)return{state:'already-owned',reason:'Already owned by this account.'};
    if(p.listing?.forSale===false||['withdrawn','closed','sold'].includes(String(p.listing?.status||'').toLowerCase()))return{state:'not-purchasable',reason:'CapitalRift reports this parcel is not for sale.'};
    if(!listingForSale(p))return{state:'needs-details',reason:'No purchase offer has been observed for this parcel.'};
    if(price(p)===null)return{state:'needs-details',reason:'Purchase price has not been observed. Appraisal is not a price.'};
    return{state:'purchasable',reason:'Observed CapitalRift sale offer and purchase price.'};
  }
  function eligible(p){return eligibility(p).state==='purchasable';}
  function metric(p,strategy,index){const pr=price(p),area=n(p?.areaM2),traffic=n(p?.busyness);switch(strategy){
    case'cheapest':return pr===null?Infinity:pr;
    case'largest':return area===null?-Infinity:-area;
    case'traffic':return traffic===null?Infinity:-traffic;
    case'pricePerM2':return pr===null||area===null||area<=0?Infinity:pr/area;
    case'center':return n(p?.distanceFromCenterM)??Infinity;
    default:return index;
  }}
  function plan(rows,opts={}){const hasSelection=Array.isArray(opts.selectedIds),selected=new Set((opts.selectedIds||[]).map(String)),seen=new Set(),candidates=[];let index=0;
    for(const p of Array.isArray(rows)?rows:[]){const id=idOf(p);if(!id||seen.has(id)||hasSelection&&!selected.has(id)||!eligible(p))continue;seen.add(id);candidates.push({p,index:index++});}
    const strategy=opts.strategy||'current';candidates.sort((a,b)=>{const av=metric(a.p,strategy,a.index),bv=metric(b.p,strategy,b.index);return av-bv||a.index-b.index||idOf(a.p).localeCompare(idOf(b.p));});
    const maxParcels=Math.max(1,Math.min(1000,Math.floor(n(opts.maxParcels)??1000))),maxSpend=n(opts.maxSpend);let spent=0,totalArea=0,knownPrices=0;const queue=[],skipped=[];
    for(const {p} of candidates){if(queue.length>=maxParcels){skipped.push({id:idOf(p),reason:'max-parcels'});continue;}const pr=price(p);if(pr===null){skipped.push({id:idOf(p),reason:'unknown-price'});continue;}if(maxSpend!==null&&spent+pr>maxSpend){skipped.push({id:idOf(p),reason:'budget'});continue;}
      queue.push({...p,selectedPrice:pr,selectedPriceSource:priceSource(p)});spent+=pr;knownPrices++;const area=n(p.areaM2);if(area!==null)totalArea+=area;
    }
    return{queue,skipped,totalPrice:spent,totalArea,knownPrices,unknownPrices:queue.length-knownPrices};
  }
  root.CRCCLandBuyer={n,idOf,listingForSale,price,priceSource,candidate,eligibility,eligible,plan};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.CRCCLandBuyer;
})(typeof globalThis!=='undefined'?globalThis:self);
