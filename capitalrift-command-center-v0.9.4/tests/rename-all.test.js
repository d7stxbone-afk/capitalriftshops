const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Rename=require('../rename-plan');
const src=fs.readFileSync(require('node:path').join(__dirname,'../content.js'),'utf8');
const original=Array.from({length:331},(_,i)=>({shopId:`shop-${i}`,name:i===330?'CRCC_LEARN_MUEEI2F':`Gross ${331+i}`,grossPerMin:331-i}));
const first=Rename.numberAll(original,'Gross {n}',(a,b)=>b.grossPerMin-a.grossPerMin);
assert.equal(first.count,331);
assert.equal(first.changes.length,331);
assert.equal(first.targets['shopId:shop-0'],1);
assert.equal(first.targets['shopId:shop-330'],331);
assert.equal(first.changes.at(-1).newName,'Gross 331');
assert.equal(Rename.numberAll([...original].reverse(),'Gross {n}',(a,b)=>b.grossPerMin-a.grossPerMin).targets['shopId:shop-330'],331);
assert.match(Rename.numberAll([{shopId:'a',name:'a'},{shopId:'a',name:'b'}],'Gross {n}').error,/unique/);
assert.match(Rename.numberAll([{name:'a'}],'Gross {n}').error,/unique/);
assert.match(Rename.numberAll([],'Gross {n}').error,/No shops/);
const missing=Array.from({length:4},(_,i)=>({id:`id-${i}`,name:i%2?'Gross 6':'Gross 9',grossPerMin:4-i}));
assert.equal(Rename.numberAll(missing,'Gross {n}',(a,b)=>b.grossPerMin-a.grossPerMin).changes.length,4,'duplicates and gaps get complete 1–N numbers');

(async()=>{
  const storage={},state={renamePattern:'Gross {n}',renameSortMode:'gross',renameStart:331,grossRebases:{},renameTemplate:{learned:true},selected:new Set(),bulkPreview:[],bulkSkipped:0,bulkRepair:false};
  let live=original.map(r=>({...r})),requests=0,failAt=0,refreshCount=0,notifications=[];
  const ctx=vm.createContext({CRCCRename:Rename,state,Date,console,Promise,Object,setTimeout:fn=>{fn();return 1},refresh:()=>{},account:()=>({id:'c',kind:'company'}),baseShopRows:a=>a.income.sources.shops.rows,shopName:r=>r.name,shopGross:r=>r.grossPerMin,shopLocation:r=>r.location||'',rowId:r=>r.shopId,render:()=>{},toast:message=>notifications.push(message),confirm:()=>true,alert:message=>notifications.push(message),chrome:{storage:{local:{get:async()=>storage,set:async patch=>Object.assign(storage,patch)}},runtime:{sendMessage:async msg=>{
    if(msg.kind==='refresh'){refreshCount++;return{ok:true,data:{accounts:{company:{id:'c',kind:'company',income:{sources:{shops:{rows:live}}}}},errors:[]}};}
    if(msg.kind==='renameShop'){requests++;if(requests===failAt)return{ok:false,error:'mock interruption'};const r=live.find(x=>x.shopId===msg.shop.shopId);r.name=msg.newName;return{ok:true};}
    throw Error(`Unexpected request ${msg.kind}`);
  }}}});
  vm.runInContext(src.slice(src.indexOf('  async function previewAllShops('),src.indexOf('  function parseCash(')),ctx);
  await vm.runInContext('previewAllShops()',ctx);
  assert.equal(refreshCount,1,'whole-account preview gets a fresh game snapshot');
  assert.equal(state.bulkPreview.length,331);
  assert.equal(state.grossRebases['company:c'].mode,'all');
  assert.equal(storage.crcc_gross_ids_v1,undefined,'preview must not change confirmed mappings');
  failAt=101;
  await vm.runInContext('applyBulk()',ctx);
  assert.equal(requests,102,'the other in-flight shop completes before the batch stops');
  assert.equal(state.grossRebases['company:c'].count,331,'interrupted plan remains saved');
  assert.equal(live[99].name,'Gross 100');
  assert.equal(live[100].name,'Gross 431');
  assert.equal(live[101].name,'Gross 102','successful paired write is retained');
  failAt=0;live.reverse();
  await vm.runInContext('previewAllShops()',ctx);
  assert.equal(state.bulkPreview.length,230,'reordered response resumes only the unfinished ID targets');
  await vm.runInContext('applyBulk()',ctx);
  assert.equal(requests,332,'only the 230 unfinished renames are retried');
  assert.equal(state.grossRebases['company:c'],undefined);
  const mapping=storage.crcc_gross_ids_v1['company:c'];
  assert.equal(Object.keys(mapping).length,331);
  assert.equal(Math.max(...Object.values(mapping)),331,'obsolete high assignments are removed');
  assert.deepEqual([...live.map(x=>Number(x.name.slice(6)))].sort((a,b)=>a-b),Array.from({length:331},(_,i)=>i+1));
  await vm.runInContext('previewAllShops()',ctx);
  assert.equal(state.bulkPreview.length,0,'second preview makes no changes');
  assert.equal(requests,332,'second run makes zero rename requests');
  assert.equal(Rename.plan([...live,{shopId:'new',name:'New'}],'Gross {n}',1,mapping).changes.at(-1).newName,'Gross 332');
  // A new shop appearing between preview and Apply must stop the old plan.
  live.find(x=>x.shopId==='shop-0').name='Changed externally';
  await vm.runInContext('previewAllShops()',ctx);
  assert.equal(state.bulkPreview.length,1);
  live.push({shopId:'new',name:'New',grossPerMin:0});
  await vm.runInContext('applyBulk()',ctx);
  assert.equal(requests,332,'changed shop count prevents stale writes');
  await vm.runInContext('previewAllShops()',ctx);
  assert.equal(state.grossRebases['company:c'].count,332,'new preview includes new shop');
  assert.equal(state.grossRebases['company:c'].targets['shopId:new'],332);
  console.log('PASS: current shop count, Gross 1–N, learning marker, ID-stable sorting, interrupted resume, zero second-run requests, changed-inventory guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
