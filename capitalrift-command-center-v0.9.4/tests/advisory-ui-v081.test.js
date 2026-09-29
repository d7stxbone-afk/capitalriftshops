const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../content.js'),'utf8'),A=require('../intel-advisory'),R=require('../region-data');
const retail=R.retail({areaId:'12/1/1',shops:1,busyness:2,wealth:1,goodsListed:1,goodsTotal:1,items:[{itemId:'a',sellersHere:0,opportunityPerMin:4,wouldSellPerMin:3,soldPerMin:2,fixture:'shelf',playerMade:true}]},100);
const account={id:'p',kind:'character',properties:[],income:{sources:{shops:{rows:[{shopId:'s',name:'Gross 1',lat:3,lon:2,buildingRef:'way/1'}]}}}};
const state={data:{identity:{companyId:null}},page:'comparison',compareSubview:'compare',productShopId:'',productScope:'',productSort:'balanced',productFixture:'',productPlayerMade:'',productMessage:'',shopAreas:{},regionIntel:{'p:12/1/1':retail},regionInfo:{},intelSubview:'gaps',gapAreaId:'',gapFilters:{maxSellers:2,minOpportunity:0,minWouldSell:null,minSold:null,zero:false,low:false,playerMadeOnly:false,nonPlayerMadeOnly:false,fixture:'',sort:'sellersHere'},scoreSort:'busyness',alertThreshold:15,shopHealth:{},shopHistory:{}};
const messages=[],saved=[];let current=account;
const ctx=vm.createContext({state,CRCCAdvisory:A,CRCCRegionData:R,esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;'),moneyExact:v=>v==null?'—':'$'+Number(v).toFixed(2),account:()=>current,intelRows:()=>[{id:'s',row:account.income.sources.shops.rows[0],name:'Gross 1'}],retailIntelView:()=>'<div>Region Intel</div>',validCoord:(lat,lon)=>Number.isFinite(Number(lat))&&Number.isFinite(Number(lon)),render:()=>{},chrome:{runtime:{sendMessage:async msg=>{messages.push(msg);return{ok:true,region:{areaId:'12/1/1',lat:msg.lat,lon:msg.lon}};}},storage:{local:{set:async x=>saved.push(x)}}},Date,Number,Object,Math,Set});
const block=source.slice(source.indexOf('  function renderIntelHub('),source.indexOf('  function intelRows('));vm.runInContext(block,ctx);
const helpers=source.slice(source.indexOf('  function shopPosition('),source.indexOf('  function renderGrossEmpire('));vm.runInContext(helpers,ctx);
ctx.a1=account;assert.match(vm.runInContext('renderIntelHub(a1)',ctx),/Competition Gap Finder/);
assert.match(vm.runInContext('renderRegionScorecard(a1)',ctx),/Derived zero-seller products/);
state.productShopId='s';state.productScope='character:p';state.shopAreas['character:p:s']={areaId:'12/1/1',buildingRef:'way/1',lat:3,lon:2};
const productHtml=vm.runInContext('renderProductFinder(a1)',ctx);assert.match(productHtml,/CC Fit Score/);assert.match(productHtml,/Required fixture|required fixture/);assert.match(productHtml,/How CC Fit Score is calculated/);
(async()=>{
  state.shopAreas={};await vm.runInContext('openProductFinder(a1,"s")',ctx);assert.equal(messages.length,1);assert.equal(messages[0].kind,'loadRegionInfo');assert.equal(messages[0].accountId,'p');assert.equal(state.shopAreas['character:p:s'].areaId,'12/1/1');assert.equal(saved.length,1);
  await vm.runInContext('openProductFinder(a1,"s")',ctx);assert.equal(messages.length,1,'repeat shop lookup uses local area cache');
  const co={...account,id:'c',kind:'company',income:{sources:{shops:{rows:[{shopId:'co',name:'Gross 2',lat:3,lon:2}]}}}};current=co;state.data.identity.companyId=null;state.shopAreas={};await vm.runInContext('openProductFinder(co,"co")',Object.assign(ctx,{co}));assert.equal(messages.length,1,'unpiloted company does not request Region Info');assert.match(state.productMessage,/Pilot this company/);
  console.log('PASS: advisory cards render; Product Finder explicit personal lookup, cache reuse and unpiloted-company block');
})().catch(e=>{console.error(e);process.exitCode=1});
