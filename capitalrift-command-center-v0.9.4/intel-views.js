/* Read-only projections for the v0.8 intelligence views. No network or storage side effects. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CRCCIntel=api;})(typeof globalThis==='object'?globalThis:this,function(){
  const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const avg=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  const id=r=>String(r?.id??r?.shopId??'');
  const grossNumber=name=>{const m=/^Gross\s+(\d+)$/i.exec(String(name||'').trim());return m&&Number(m[1])>0?Number(m[1]):null;};
  function history(h){const days=(h?.days||[]).filter(d=>n(d.day)!==null).sort((a,b)=>b.day-a.day),summarize=(count,offset=0)=>{const rows=days.slice(offset,offset+count);return{days:rows.length,revenue:avg(rows.map(d=>n(d.revenue)).filter(x=>x!==null)),units:avg(rows.map(d=>n(d.units)).filter(x=>x!==null))};};
    const recent=summarize(7),previous=summarize(7,7),all30=summarize(30),withRevenue=days.filter(d=>n(d.revenue)!==null);let trend=null;
    if(recent.revenue!==null&&previous.revenue!==null)trend=previous.revenue===0?(recent.revenue===0?0:null):100*(recent.revenue-previous.revenue)/Math.abs(previous.revenue);
    return{latest:days[0]||null,recent,previous,all30,trend,highest:withRevenue.length?withRevenue.reduce((a,b)=>n(b.revenue)>n(a.revenue)?b:a):null,lowest:withRevenue.length?withRevenue.reduce((a,b)=>n(b.revenue)<n(a.revenue)?b:a):null};
  }
  function shops(account,health={},histories={}){const scope=String(account?.id||''),seen=new Set(),out=[];for(const r of account?.income?.sources?.shops?.rows||[]){const key=id(r);if(!key||seen.has(key))continue;seen.add(key);const m=(typeof CRCCShopMetrics!=='undefined'?CRCCShopMetrics:require('./shop-metrics.js')).derive(r,health[`${scope}:${key}`]||{}),h=histories[`${scope}:${key}`];out.push({id:key,stableId:(typeof CRCCRename!=='undefined'?CRCCRename:require('./rename-plan.js')).idOf(r),row:r,name:r.name??r.shopName??r.label??key,areaId:r.areaId??r.regionId??null,buildingRef:r.buildingRef??null,unitKey:r.unitKey??null,...m,history:h?history(h):null});}return out;}
  function sort(rows,key,ascending=false){return [...rows].sort((a,b)=>{const av=n(a[key]),bv=n(b[key]);if(av===null)return bv===null?a.id.localeCompare(b.id):1;if(bv===null)return -1;return(ascending?av-bv:bv-av)||a.id.localeCompare(b.id);});}
  function gross(rows,mapping={}){const out=[];for(const r of rows){const mapped=n(mapping[r.stableId]),fromName=grossNumber(r.name),number=mapped!==null&&mapped>0?mapped:fromName;if(number!==null)out.push({...r,grossNumber:number,recentRevenue:r.history?.recent.revenue??null,recentUnits:r.history?.recent.units??null});}return out.sort((a,b)=>a.grossNumber-b.grossNumber||a.id.localeCompare(b.id));}
  function grossRoster(rows,mapping={}){const numbered=gross(rows,mapping),ids=new Set(numbered.map(r=>r.id)),unnumbered=rows.filter(r=>!ids.has(r.id)).map(r=>({...r,grossNumber:null}));return{rows:[...numbered,...unnumbered],numbered:numbered.length,unnumbered:unnumbered.length};}
  function observedHistories(accountId,histories={},roster=[]){const known=new Set(roster.map(r=>String(r.id))),prefix=String(accountId)+':',out=[];for(const [key,h] of Object.entries(histories)){if(!key.startsWith(prefix)||!h?.shopId||key!==prefix+h.shopId||known.has(String(h.shopId)))continue;out.push(h);}return out.sort((a,b)=>(n(b.observedAt)??0)-(n(a.observedAt)??0)).slice(0,50);}
  function summary(rows){const valid=k=>rows.map(r=>n(r[k])).filter(x=>x!==null);return{count:rows.length,grossPerMin:rows.every(r=>n(r.grossPerMin)!==null)?rows.reduce((s,r)=>s+n(r.grossPerMin),0):null,gameNetPerMin:rows.every(r=>n(r.gameNetPerMin)!==null)?rows.reduce((s,r)=>s+n(r.gameNetPerMin),0):null,busyness:avg(valid('footTraffic')),wealth:avg(valid('wealth')),appeal:avg(valid('appealGrade'))};}
  function deals(entities,filters={}){const mode=filters.mode==='room'?'room':'building',out=[];for(const e of entities||[]){if(e?.entityType!==mode)continue;const area=n(e.areaM2),traffic=n(e.busyness),value=n(e.value),rent=n(e.rentPerDay);
      const min=n(filters.minArea),max=n(filters.maxArea);if(min!==null&&(area===null||area<min)||max!==null&&(area===null||area>max))continue;
      const tmin=n(filters.minTraffic);if(tmin!==null&&(traffic===null||traffic<tmin))continue;
      if(mode==='building'){
        const vmax=n(filters.maxValue),floors=n(filters.minFloors);if(vmax!==null&&(value===null||value>vmax)||floors!==null&&(n(e.floors)===null||n(e.floors)<floors))continue;
        if(filters.owner&&filters.owner!=='any'&&(typeof CRCCScoutSurvey!=='undefined'?CRCCScoutSurvey.ownership(e):ownership(e))!==filters.owner)continue;
        if(filters.vacant&&!(n(e.vacantRooms)>0)||filters.openShop&&e.hasOpenShop!==true||filters.openBusiness&&e.hasOpenBusiness!==true)continue;
      }else{
        const maxRent=n(filters.maxRent),floor=n(filters.floor);if(maxRent!==null&&(rent===null||rent>maxRent)||floor!==null&&(n(e.floor)===null||n(e.floor)!==floor))continue;
        if(filters.vacant&&e.status!=='vacant'||filters.kind&&filters.kind!=='any'&&e.kind!==filters.kind||filters.tenant&&filters.tenant!=='any'&&(e.tenantId?'occupied':e.status==='vacant'?'vacant':'unknown')!==filters.tenant)continue;
      }
      out.push({...e,perM2:area>0?(mode==='room'&&rent!==null?rent/area:mode==='building'&&value!==null?value/area:null):null});
    }
    const options=mode==='room'?{rent:'rentPerDay',perM2:'perM2',area:'areaM2',busyness:'busyness'}:{value:'value',perM2:'perM2',area:'areaM2',busyness:'busyness'};const field=options[filters.sort]||options[mode==='room'?'rent':'value'];const asc=['rent','perM2','value'].includes(filters.sort|| (mode==='room'?'rent':'value'));return out.sort((a,b)=>{const x=n(a[field]),y=n(b[field]);return x===null?y===null?String(a.ref).localeCompare(String(b.ref)):1:y===null?-1:(asc?x-y:y-x)||String(a.ref).localeCompare(String(b.ref));});
  }
  function ownership(e){const o=e.owner||e.landlord;return e.myOwned?'me':e.explicitlyUnowned?'unowned':o?.kind==='npc'?'npc':o?.kind==='player'||o?.playerId?'player':'unknown';}
  async function bounded(items,limit,work){let next=0;const result=new Array(items.length);await Promise.all(Array.from({length:Math.min(Math.max(1,limit),items.length)},async()=>{for(;;){const i=next++;if(i>=items.length)return;result[i]=await work(items[i],i);}}));return result;}
  return{n,id,grossNumber,history,shops,sort,gross,grossRoster,observedHistories,summary,deals,bounded};
});
