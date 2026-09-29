const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const content=fs.readFileSync(path.join(__dirname,'../content.js'),'utf8');
const a={north:1,south:0,east:1,west:0,source:'game-map-bounds'};
const b={north:3,south:2,east:3,west:2,source:'game-map-bounds'};
const c={north:5,south:4,east:5,west:4,source:'game-map-bounds'};
function setup(views){
  const state={page:'scout',scoutSurveyId:0,scoutSurvey:null,scoutViewport:a,scoutStatus:'ready',scoutMessage:'',scoutSurveyFilters:{target:'room'},renderFilters:{},landBuySelected:new Set()};
  let calls=0,index=0;
  const ctx=vm.createContext({state,console,Date,Math,Number,setTimeout,clearTimeout,window:{postMessage(){}},chrome:{runtime:{sendMessage:async()=>{calls++;return{ok:true,result:{status:'ready',entities:[{ref:'room-'+calls}],stats:{chunksLoaded:1},viewport:views[index-1]}};}}},render:()=>{},pruneLandSelection:()=>{}});
  vm.runInContext(content.slice(content.indexOf('  function scoutViewportChanged('),content.indexOf('  function scoutAreaSelect(')),ctx);
  vm.runInContext(content.slice(content.indexOf('  let viewportWaiters='),content.indexOf('  let transactionIdentityCheck=')),ctx);
  ctx.requestScoutViewport=async()=>views[index++];
  return{ctx,state,calls:()=>calls};
}
test('second search in a new area replaces results; old completed view is not a motion check',async()=>{
  const x=setup([b,b,c,c]);
  await vm.runInContext('surveyCurrentViewport()',x.ctx);
  assert.equal(x.state.scoutStatus,'ready');assert.equal(x.state.scoutViewport.north,3);
  await vm.runInContext('surveyCurrentViewport()',x.ctx);
  assert.equal(x.state.scoutStatus,'ready');assert.equal(x.state.scoutViewport.north,5);
  assert.equal(x.state.scoutSurvey.entities[0].ref,'room-2');assert.equal(x.calls(),2);
});
test('movement during the same search rejects stale results without poisoning a retry',async()=>{
  const x=setup([b,c,c,c]);
  await vm.runInContext('surveyCurrentViewport()',x.ctx);
  assert.equal(x.state.scoutStatus,'viewport-changed');assert.equal(x.state.scoutSurvey,null);
  await vm.runInContext('surveyCurrentViewport()',x.ctx);
  assert.equal(x.state.scoutStatus,'ready');assert.equal(x.state.scoutViewport.north,5);
});
