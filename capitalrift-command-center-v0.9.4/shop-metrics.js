/* Capital Rift shop metrics from account fields and optional observed panel values. */
(function(root){
  const number=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  function derive(row,health={},restockers=0){
    const gross=number(row?.grossPerMin),cost=number(row?.costPerMin),wages=number(row?.wagePerMin);
    const registerUsed=number(row?.checkoutUsedPerMin),registerRate=number(row?.checkoutRatePerMin);
    const salesPerMin=number(row?.salesPerMin)??number(health?.unitsSoldPerMin);
    return{
      appealGrade:number(row?.appeal)??number(health?.appealGrade),
      registerBusy:registerUsed!=null&&registerRate>0?100*registerUsed/registerRate:number(health?.registerBusy),
      footTraffic:number(row?.busyness)??number(health?.footTraffic),
      wealth:number(row?.wealth),
      customersPerMin:number(row?.customersPerMin)??number(health?.shoppersPerMin),
      basketUnits:number(row?.basketUnits),
      checkoutRatePerMin:registerRate,checkoutUsedPerMin:registerUsed,
      grossPerMin:gross,costPerMin:cost,ownStockPerMin:number(row?.ownStockPerMin),wagePerMin:wages,
      dayRevenue:number(row?.dayRevenue),dayUnits:number(row?.dayUnits),dayItemRev:number(row?.dayItemRev),
      restockMode:row?.restockMode??null,
      salesPerMin,
      salesPerRestocker:restockers>0&&salesPerMin!=null?salesPerMin/restockers:null,
      gameNetPerMin:gross!=null&&cost!=null&&wages!=null?gross-cost-wages:null,
      liveTakings:number(health?.takingsPerMin),liveProfit:number(health?.profitPerMin)
    };
  }
  const api={derive};if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.CRCCShopMetrics=api;
})(typeof globalThis!=='undefined'?globalThis:this);
