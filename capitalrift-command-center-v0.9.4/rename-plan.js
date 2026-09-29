/* Stable, account-scoped Gross numbering. Pure planner, also exercised by node tests. */
(function(root){
  const idOf=r=>{for(const k of ['shopId','storeId','businessKey','unitKey','id'])if(r?.[k]!=null&&String(r[k]).trim())return `${k}:${r[k]}`;return null;};
  const nameOf=r=>String(r?.name??r?.shopName??r?.storeName??r?.title??r?.label??'Unnamed shop');
  const regex=pattern=>{const parts=pattern.split('{n}');if(parts.length!==2||/\{(?:old|location)\}/.test(pattern))return null;const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`^${esc(parts[0])}(\\d+)${esc(parts[1])}$`,'i');};
  function plan(rows,pattern,start,mapping={},selected=null){
    const match=regex(pattern);if(!match)return{changes:[],assignments:{...mapping},skipped:0,unresolved:0,error:'Use a pattern with one {n} and no other placeholders for stable numbering.'};
    const all=[...rows],active=selected?all.filter(selected):all,byId=new Map(),duplicates=new Set();
    for(const r of all){const id=idOf(r);if(!id)continue;if(byId.has(id))duplicates.add(id);else byId.set(id,r);}
    const assignments={...mapping},owners=new Map(),valid=[];let highest=Math.max(0,Math.trunc(Number(start)||1)-1);
    for(const [id,n] of Object.entries(mapping)){if(Number.isSafeInteger(n)&&n>=0){highest=Math.max(highest,n);if(!owners.has(n))owners.set(n,id);}}
    // All current names reserve their numbers, including shops outside a selection.
    for(const r of all){const id=idOf(r),m=nameOf(r).match(match),n=m?Number(m[1]):null;if(n==null||!Number.isSafeInteger(n)||n<0)continue;highest=Math.max(highest,n);valid.push({r,id,n});}
    // Existing durable assignments win conflicts; otherwise choose the stable ID.
    valid.sort((a,b)=>Number(mapping[b.id]===b.n)-Number(mapping[a.id]===a.n)||String(a.id||'~').localeCompare(String(b.id||'~')));
    for(const {id,n} of valid){if(id&&!duplicates.has(id)&&(!owners.has(n)||owners.get(n)===id)){owners.set(n,id);assignments[id]=n;}}
    let next=highest+1,skipped=0,unresolved=0;const changes=[];
    for(const r of active){const id=idOf(r),old=nameOf(r),m=old.match(match),existing=m?Number(m[1]):null;
      if(!id||duplicates.has(id)){unresolved++;continue;}
      let n=assignments[id];if(!Number.isSafeInteger(n)||n<0||owners.get(n)!==id){while(owners.has(next))next++;n=next++;owners.set(n,id);assignments[id]=n;}
      const newName=pattern.replace('{n}',String(n));if(old!==newName)changes.push({shop:r,id,old,newName,assignedNumber:n});else skipped++;
    }
    return{changes,assignments,skipped,unresolved};
  }
  function detectShiftedRange(rows,pattern){
    const match=regex(pattern),all=[...rows];if(!match||!all.length)return null;
    const seenIds=new Set(),seenNumbers=new Set(),entries=[];
    for(const r of all){const id=idOf(r),m=nameOf(r).match(match),n=m?Number(m[1]):null;
      if(!id||seenIds.has(id)||!Number.isSafeInteger(n)||n<1||seenNumbers.has(n))return null;
      seenIds.add(id);seenNumbers.add(n);entries.push({id,n});}
    const numbers=entries.map(e=>e.n).sort((a,b)=>a-b),first=numbers[0],last=numbers.at(-1);
    // A full account-size shift is recognizable without relying on row order.
    // Smaller offsets may be intentional persistent numbering and remain intact.
    if(all.length<10||first<all.length||last-first+1!==all.length)return null;
    return{first,last,count:all.length,targets:Object.fromEntries(entries.map(({id,n})=>[id,n-first+1]))};
  }
  function repair(rows,pattern,targets){
    const match=regex(pattern);if(!match||!targets||typeof targets!=='object')return{changes:[],skipped:0,unresolved:0,error:'No valid Gross repair plan.'};
    const ids=new Set(),numbers=new Set();for(const [id,n] of Object.entries(targets)){if(!id||!Number.isSafeInteger(n)||n<1||numbers.has(n))return{changes:[],skipped:0,unresolved:0,error:'Repair plan has duplicate or invalid numbers.'};numbers.add(n);}
    const changes=[];let skipped=0,unresolved=0;
    for(const r of rows){const id=idOf(r);if(!id||ids.has(id)){unresolved++;continue;}ids.add(id);
      const n=targets[id];if(!Number.isSafeInteger(n)){unresolved++;continue;}
      const old=nameOf(r),newName=pattern.replace('{n}',String(n));if(old===newName)skipped++;else changes.push({shop:r,id,old,newName,assignedNumber:n});}
    return{changes,skipped,unresolved,assignments:{...targets}};
  }
  function numberAll(rows,pattern,compare){
    if(!regex(pattern))return{error:'Use a pattern with exactly one {n} to renumber the whole account.'};
    const ids=new Set();for(const r of rows){const id=idOf(r);if(!id||ids.has(id))return{error:'Every shop needs a unique game ID before renumbering the whole account.'};ids.add(id);}
    if(!ids.size)return{error:'No shops were reported for this account.'};
    // The sort is only used once, when the plan is created. Saved targets are
    // keyed by game ID so reordered responses and interrupted runs stay stable.
    const ordered=[...rows].sort((a,b)=>(compare?compare(a,b):0)||idOf(a).localeCompare(idOf(b)));
    const targets=Object.fromEntries(ordered.map((r,i)=>[idOf(r),i+1]));
    return{count:rows.length,targets,...repair(rows,pattern,targets)};
  }
  root.CRCCRename={plan,idOf,detectShiftedRange,repair,numberAll};if(typeof module!=='undefined')module.exports=root.CRCCRename;
})(globalThis);
