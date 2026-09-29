/* Click a game row only when its stable unit key is unique and visible. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CRCCRoomNavigation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function openExact(document,key){
    if(typeof key!=='string'||!key||key.length>=300)return{ok:false,reason:'invalid'};
    const rows=[...document.querySelectorAll('.cr-root [data-unit-key], .cr-root [data-room-key]')].filter(el=>(el.getAttribute('data-unit-key')||el.getAttribute('data-room-key'))===key&&el.getClientRects().length);
    if(rows.length!==1)return{ok:false,reason:rows.length?'ambiguous':'missing'};
    const row=rows[0],target=row.closest('button,[role="button"]')||row;
    target.click();return{ok:true};
  }
  return{openExact};
});
