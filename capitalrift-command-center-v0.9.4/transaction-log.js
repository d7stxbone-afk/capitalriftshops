/* Individual CapitalRift bank entries. Actor attribution requires an explicit game field. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CRCCTransactions=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const CAP=5000;
  const reviewKinds=new Set(['send','transfer','withdraw','withdrawal','payout','casino_fund','property','land','purchase_property','buy_land']);
  const pick=(row,keys)=>{for(const key of keys)if(row?.[key]!=null&&row[key]!=='')return row[key];return null;};
  const clean=x=>x==null?null:String(x).slice(0,240);
  function normalize(tx,bank){
    if(!tx||typeof tx!=='object'||!Number.isFinite(Number(tx.ts??tx.timestamp))||!Number.isFinite(Number(tx.amount)))return null;
    const ts=Number(tx.ts??tx.timestamp),amount=Number(tx.amount),kind=clean(tx.kind)||'other',description=clean(tx.desc??tx.description??tx.memo)||'No description';
    const sourceId=clean(tx.id??tx.transactionId),bankId=clean(bank?.id);
    const id=sourceId?['game',bankId||'unknown',sourceId].join(':'):['composite',bankId||'unknown',ts,kind,amount,description].join(':');
    const actor=tx.actor&&typeof tx.actor==='object'?tx.actor:tx.performedBy&&typeof tx.performedBy==='object'?tx.performedBy:null;
    const actorId=clean(pick(tx,['actorId','performedById','initiatorId','createdById'])??pick(actor,['playerId','id']));
    const actorName=clean(pick(tx,['actorName','performedByName','initiatorName','createdByName'])??pick(actor,['name','playerName']));
    // Recipient/beneficiary fields are not the person who initiated the transaction.
    const recipient=clean(pick(tx,['recipientName','toName','beneficiaryName']));
    return{id,gameId:sourceId,ts,amount,kind,description,bankIds:bankId?[bankId]:[],bankNames:bank?.name?[clean(bank.name)]:[],actorId,actorName,recipient,source:'game-bank-entry'};
  }
  function fromAccount(account){const entries=[];for(const bank of account?.bank?.accounts||[])for(const tx of bank?.transactions||[]){const row=normalize(tx,bank);if(row)entries.push(row);}return entries;}
  function merge(previous,entries,cap=CAP){const map=new Map();for(const row of [...(previous||[]),...(entries||[])]){if(!row?.id)continue;const old=map.get(row.id);map.set(row.id,old?{...old,...row,bankIds:[...new Set([...(old.bankIds||[]),...(row.bankIds||[])])],bankNames:[...new Set([...(old.bankNames||[]),...(row.bankNames||[])])],actorId:row.actorId||old.actorId||null,actorName:row.actorName||old.actorName||null}:row);}return [...map.values()].sort((a,b)=>b.ts-a.ts||a.id.localeCompare(b.id)).slice(0,Math.max(1,cap));}
  function review(row,threshold=100000){return row.amount<0&&(reviewKinds.has(String(row.kind).toLowerCase())||Math.abs(row.amount)>=Math.max(0,Number(threshold)||0));}
  function filter(rows,{query='',actor='',kind='',outflowsOnly=false,reviewOnly=false,minAmount=0,from='',to='',threshold=100000}={}){
    const q=String(query).toLowerCase().trim(),who=String(actor).toLowerCase().trim(),min=Math.max(0,Number(minAmount)||0);
    return(rows||[]).filter(r=>(!outflowsOnly||r.amount<0)&&(!reviewOnly||review(r,threshold))&&Math.abs(r.amount)>=min&&(!kind||r.kind===kind)&&(!who||String(r.actorName||r.actorId||'Unknown').toLowerCase().includes(who))&&(!from||r.ts>=new Date(from+'T00:00:00').getTime())&&(!to||r.ts<=new Date(to+'T23:59:59.999').getTime())&&(!q||[r.description,r.kind,r.recipient,r.actorName,r.actorId,r.gameId].some(v=>String(v||'').toLowerCase().includes(q))));
  }
  function csv(rows){const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';return[['Time','Kind','Amount','Description','Actor','Actor ID','Recipient','Bank','Transaction ID','Review'].join(','),...(rows||[]).map(r=>[new Date(r.ts).toISOString(),r.kind,r.amount,r.description,r.actorName||'Unknown',r.actorId,r.recipient,(r.bankNames||[]).join('; '),r.gameId||r.id,review(r)?'Review':''].map(quote).join(','))].join('\r\n');}
  return{CAP,normalize,fromAccount,merge,review,filter,csv};
});
