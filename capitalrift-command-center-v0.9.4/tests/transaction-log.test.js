const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const T=require('../transaction-log.js');

const base=Date.UTC(2026,8,23,12);
const bank=(rows,id='primary')=>({bank:{accounts:[{id,name:'Company cash',transactions:rows}]}});
const tx=(id,amount,more={})=>({id,ts:base,kind:'send',amount,desc:'Company transfer',...more});

test('stable IDs deduplicate reorder and retain entries missing from later snapshots',()=>{
  const first=T.fromAccount(bank([tx('one',-120),tx('two',-50)]));
  const later=T.fromAccount(bank([tx('two',-50),tx('one',-120),tx('three',45)]));
  assert.equal(T.merge(first,later).length,3);
  assert.deepEqual(T.merge(T.merge(first,later),[]),T.merge(first,later));
  assert.equal(T.merge(T.merge(first,later),T.fromAccount(bank([]))).length,3);
});

test('bank identity distinguishes entries sharing a game transaction ID',()=>{
  const account={bank:{accounts:[{id:'cash',name:'Cash',transactions:[tx('same',-500)]},{id:'reserve',name:'Reserve',transactions:[tx('same',500)]}]}};
  const rows=T.merge([],T.fromAccount(account));
  assert.equal(rows.length,2);
  assert.equal(rows.reduce((sum,row)=>sum+row.amount,0),0);
});

test('recipient and member beneficiary never become initiator',()=>{
  const row=T.normalize(tx('x',-700,{recipientName:'Alice',memberId:'member-a',memberName:'Alice'}),{id:'b'});
  assert.equal(row.actorId,null);
  assert.equal(row.actorName,null);
  assert.equal(row.recipient,'Alice');
  const explicit=T.normalize(tx('x',-700,{initiatorId:'actor-1',initiatorName:'Bob'}),{id:'b'});
  assert.equal(T.merge([explicit],[row])[0].actorId,'actor-1');
});

test('filters, review threshold, dates, and CSV expose actual entries',()=>{
  const rows=T.merge([],T.fromAccount(bank([tx('out',-150000,{kind:'purchase',desc:'Equipment'}),tx('small',-25,{kind:'wage',desc:'Payroll'}),tx('in',200,{kind:'sale',desc:'Sales'})])));
  assert.equal(T.filter(rows,{reviewOnly:true}).length,1);
  assert.equal(T.filter(rows,{outflowsOnly:true}).length,2);
  assert.equal(T.filter(rows,{minAmount:100,query:'equipment'}).length,1);
  assert.equal(T.filter(rows,{from:'2026-09-24'}).length,0);
  assert.equal(T.filter(rows,{to:'2026-09-22'}).length,0);
  assert.match(T.csv(rows),/Equipment/);
  assert.match(T.csv(rows),/Unknown/);
});

test('invalid rows are ignored, prior rows capped, and company requests stay scoped',()=>{
  assert.equal(T.normalize({id:'bad',amount:'NaN',ts:base},{id:'b'}),null);
  const entries=Array.from({length:7},(_,i)=>T.normalize({id:String(i),amount:i,ts:base+i,kind:'sale'},{id:'b'}));
  assert.deepEqual(T.merge([],entries,3).map(x=>x.gameId),['6','5','4']);
  const bg=fs.readFileSync(path.join(__dirname,'../background.js'),'utf8');
  assert.match(bg,/if\(companyFeed&&companyId&&String\(companyFeed\.id\)===String\(companyId\)\)/);
  assert.match(bg,/owner!==String\(personalId\).*company!==String\(companyId\)/);
  const ui=fs.readFileSync(path.join(__dirname,'../content.js'),'utf8');
  assert.match(ui,/if\(state\.page==='transactions'\)bindTransactions\(\)/);
  assert.match(ui,/if\(state\.page==='transactions'\)checkTransactionCompany\(\)/);
  assert.match(ui,/state\.data\.diagnostics\?\.identity!=='working'/);
});
