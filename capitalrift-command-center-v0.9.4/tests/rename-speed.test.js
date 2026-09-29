const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../content.js'),'utf8');
const background=fs.readFileSync(path.join(__dirname,'../background.js'),'utf8');
const shops=Array.from({length:9},(_,i)=>({shopId:`s${i}`,name:`Old ${i}`}));
const state={renameTemplate:{namePath:'name'},bulkPreview:shops.map((shop,i)=>({shop,id:`shopId:s${i}`,scope:'company:owned',assignedNumber:i+1,old:shop.name,newName:`Gross ${i+1}`})),grossRebases:{},bulkRepair:false,bulkSkipped:0};
let active=0,peak=0,requests=0,reads=0,writes=0,notifications=[];
const stored={crcc_gross_ids_v1:{}};
const context=vm.createContext({state,CRCCRename:require('../rename-plan'),setTimeout:()=>{},refresh:()=>{},toast:x=>notifications.push(x),alert:x=>notifications.push(x),confirm:()=>true,render:()=>{},chrome:{storage:{local:{get:async key=>{reads++;return{[key]:stored[key]};},set:async patch=>{writes++;Object.assign(stored,patch);}}},runtime:{sendMessage:async msg=>{
  if(msg.kind!=='renameShop')throw Error('unexpected game request');
  active++;peak=Math.max(peak,active);requests++;
  await Promise.resolve(); // Both requests in a batch are in flight together.
  msg.shop.name=msg.newName;active--;
  return{ok:true};
}}}});
vm.runInContext(source.slice(source.indexOf('  async function applyBulk(){'),source.indexOf('  function parseCash(')),context);
(async()=>{
  await vm.runInContext('applyBulk()',context);
  assert.equal(requests,9);
  assert.equal(peak,2,'no more than two game rename requests in flight');
  assert.equal(reads,1,'ID mapping read once for the run');
  assert.equal(writes,5,'ID mappings committed once for each confirmed pair');
  assert.equal(Object.keys(stored.crcc_gross_ids_v1['company:owned']).length,9);
  assert.deepEqual(shops.map(x=>x.name),Array.from({length:9},(_,i)=>`Gross ${i+1}`));
  const saved={},active={piloting:{companyId:'owned'}};
  const learn=vm.createContext({Date,gameGet:async()=>active,arr:x=>Array.isArray(x)?x:[],KEY:'snapshot',LEARN_KEY:'learn',chrome:{storage:{local:{get:async()=>({snapshot:{accounts:{company:{id:'owned',income:{sources:{shops:{rows:[{shopId:'s0',name:'Old 0'}]}}}}}}}),set:async value=>Object.assign(saved,value)}}}});
  vm.runInContext(background.slice(background.indexOf('function activeAccountFromMe('),background.indexOf('const humanKey=')),learn);
  vm.runInContext(background.slice(background.indexOf('async function beginRenameLearning('),background.indexOf('async function performBuildingRename(')),learn);
  learn.request={scope:'company',accountId:'owned',shop:{shopId:'s0',name:'Old 0'}};
  assert.equal((await vm.runInContext('beginRenameLearning(request)',learn)).shop.shopId,'s0');
  assert.equal(saved.learn.accountId,'owned');
  learn.request.shop={shopId:'not-owned',name:'Other'};
  await assert.rejects(vm.runInContext('beginRenameLearning(request)',learn),/not confirmed uniquely/);
  learn.request.shop={shopId:'s0'};learn.request.accountId='different';
  await assert.rejects(vm.runInContext('beginRenameLearning(request)',learn),/selected account/);
  console.log('PASS: two-at-a-time rename, no fixed per-shop pause, one mapping read and five confirmed batch writes');
})().catch(error=>{console.error(error);process.exitCode=1;});
