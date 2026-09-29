/* Pure, game-data-only viewport filtering shared by the panel and service worker. */
(function(root){
  const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const empty=()=>({target:'any',buildingMin:null,buildingMax:null,roomMin:null,roomMax:null,roomsMin:null,roomsMax:null,landMin:null,landMax:null,trafficMin:null,valueMin:null,valueMax:null,rentMin:null,rentMax:null,vacant:false,availability:'any',ownership:'any',sort:'traffic',gameOnly:true});
  const domains={any:['building','room','land','shop'],building:['building'],room:['room'],shop:['shop'],land:['land']};
  function active(raw){const f={...empty(),...raw};if(!domains[f.target])f.target='any';
    for(const k of ['buildingMin','buildingMax','roomMin','roomMax','roomsMin','roomsMax','landMin','landMax','trafficMin','valueMin','valueMax','rentMin','rentMax'])f[k]=n(f[k]);
    if(f.target==='building'||f.target==='land'){f.roomMin=f.roomMax=f.rentMin=f.rentMax=null;f.vacant=false;}
    if(f.target==='land'){f.buildingMin=f.buildingMax=f.roomsMin=f.roomsMax=null;}
    if(f.target==='room'||f.target==='shop'){f.roomsMin=f.roomsMax=null;f.landMin=f.landMax=null;f.valueMin=f.valueMax=null;}
    if(f.target==='building'){f.landMin=f.landMax=null;}
    if(f.target==='any'){f.roomMin=f.roomMax=f.roomsMin=f.roomsMax=f.landMin=f.landMax=f.rentMin=f.rentMax=null;f.vacant=false;}
    for(const [lo,hi] of [['buildingMin','buildingMax'],['roomMin','roomMax'],['roomsMin','roomsMax'],['landMin','landMax'],['valueMin','valueMax'],['rentMin','rentMax']])if(f[lo]!==null&&f[hi]!==null&&f[lo]>f[hi])f[hi]=f[lo];
    return f;
  }
  function bounds(v){if(!v)return null;const north=n(v.north),south=n(v.south),east=n(v.east),west=n(v.west);if([north,south,east,west].some(x=>x===null)||north<=south||east===west||north>85.06||south< -85.06||east>180||west< -180)return null;return{north,south,east,west};}
  function inside(lat,lon,b){lat=n(lat);lon=n(lon);return lat!==null&&lon!==null&&lat<=b.north&&lat>=b.south&&(b.west<=b.east?lon>=b.west&&lon<=b.east:lon>=b.west||lon<=b.east);}
  function intersects(entity,b){if(!b)return false;const box=entity.footprintBounds;
    if(box&&[box.north,box.south,box.east,box.west].every(x=>n(x)!==null))return box.north>=b.south&&box.south<=b.north&&(b.west<=b.east?box.east>=b.west&&box.west<=b.east:true);
    return inside(entity.lat,entity.lon,b);
  }
  function availability(e){if(e.entityType==='room'||e.entityType==='shop'){
    if(e.status==='vacant'&&n(e.rentPerDay)!==null)return 'rentable';
    if(e.status==='leased'||e.status==='occupied')return 'occupied';return 'unknown';
  }
    if((e.entityType==='land'||e.entityType==='building')&&(e.listing?.kind==='sale'||e.listing?.type==='sale'||e.listing?.forSale===true))return 'purchasable';
    return 'unknown'; // Neither a null owner nor a game appraisal is an offer to sell.
  }
  function ownership(e){const o=e.owner||e.landlord;if(e.myOwned===true)return'me';if(e.explicitlyUnowned===true)return'unowned';if(!o)return'unknown';if(o.kind==='npc')return'npc';if(o.kind==='player'||o.playerId)return'player';return'unknown';}
  function filter(entities,raw,b){const f=active(raw),box=bounds(b),matches=[],stats={surveyed:0,building:0,room:0,land:0,shop:0,rejected:{type:0,area:0,traffic:0,value:0,availability:0,ownership:0,vacancy:0}};
    for(const e of entities){if(!e?.ref||!domains.any.includes(e.entityType)||box&&!intersects(e,box))continue;stats.surveyed++;stats[e.entityType]++;
      const fail=k=>{stats.rejected[k]++;};if(f.target!=='any'&&e.entityType!==f.target){fail('type');continue;}
      const area=e.entityType==='building'?n(e.areaM2):e.entityType==='land'?n(e.areaM2):n(e.areaM2),lo=e.entityType==='building'?f.buildingMin:e.entityType==='land'?f.landMin:f.roomMin,hi=e.entityType==='building'?f.buildingMax:e.entityType==='land'?f.landMax:f.roomMax;
      if(lo!==null&&(area===null||area<lo)||hi!==null&&(area===null||area>hi)){fail('area');continue;}
      if((e.entityType==='room'||e.entityType==='shop')&&(f.buildingMin!==null||f.buildingMax!==null)){const a=n(e.buildingAreaM2);if(f.buildingMin!==null&&(a===null||a<f.buildingMin)||f.buildingMax!==null&&(a===null||a>f.buildingMax)){fail('area');continue;}}
      if(e.entityType==='building'&&(f.roomsMin!==null||f.roomsMax!==null)){const c=n(e.roomCount);if(f.roomsMin!==null&&(c===null||c<f.roomsMin)||f.roomsMax!==null&&(c===null||c>f.roomsMax)){fail('area');continue;}}
      const traffic=n(e.busyness);if(f.trafficMin!==null&&(traffic===null||traffic<f.trafficMin)){fail('traffic');continue;}
      const value=n(e.value);if(f.valueMin!==null&&(value===null||value<f.valueMin)||f.valueMax!==null&&(value===null||value>f.valueMax)){fail('value');continue;}
      const rent=n(e.rentPerDay);if(f.rentMin!==null&&(rent===null||rent<f.rentMin)||f.rentMax!==null&&(rent===null||rent>f.rentMax)){fail('value');continue;}
      if(f.ownership!=='any'&&ownership(e)!==f.ownership){fail('ownership');continue;}
      const a=availability(e);if(f.availability!=='any'&&a!==f.availability){fail('availability');continue;}
      if(f.vacant&&(e.entityType==='room'||e.entityType==='shop')&&e.status!=='vacant'){fail('vacancy');continue;}
      matches.push({...e,availability:a,ownershipType:ownership(e)});
    }
    const sort=f.sort,field=sort==='area'?'areaM2':sort==='value'||sort==='valueAsc'?'value':sort==='rent'||sort==='rentAsc'?'rentPerDay':sort==='gross'?'grossPerMin':'busyness',ascending=sort==='valueAsc'||sort==='rentAsc';
    matches.sort((a,b)=>{const va=n(a[field]),vb=n(b[field]);return va===null&&vb===null?String(a.ref).localeCompare(String(b.ref)):va===null?1:vb===null?-1:(ascending?va-vb:vb-va)||String(a.ref).localeCompare(String(b.ref));});
    return{matches,stats,filters:f};
  }
  root.CRCCScoutSurvey={empty,active,bounds,inside,intersects,availability,ownership,filter};
})(typeof globalThis!=='undefined'?globalThis:self);
