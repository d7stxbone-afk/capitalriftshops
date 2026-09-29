/* Public/system social reads only; no game social writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CRCCChatIntel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const KEYS=['announcements','general','bug-reports','suggestions'],CAP=1200;
  function channels(summary){const items=Array.isArray(summary?.channels)?summary.channels:Array.isArray(summary)?summary:[];return items.filter(c=>KEYS.includes(c?.key)&&['system_chat','system_forum'].includes(c.kind)&&c.id).map(c=>({id:String(c.id),key:c.key,kind:c.kind,name:String(c.name||c.key),lastMessageId:c.lastMessageId??null,myLastReadId:c.myLastReadId??null}));}
  const list=data=>Array.isArray(data)?data:Array.isArray(data?.messages)?data.messages:Array.isArray(data?.posts)?data.posts:Array.isArray(data?.items)?data.items:[];
  function message(m,c){const id=m?.id??m?.messageId;if(id==null)return null;return{id:String(id),channelId:c.id,channelKey:c.key,channelName:c.name,authorId:m.authorId??m.author?.id??null,authorName:String(m.authorName??m.author?.name??''),body:String(m.body??m.text??m.content??'').slice(0,4000),createdAt:m.createdAt??m.ts??null,editedAt:m.editedAt??null,deleted:!!m.deleted,threadId:m.threadId??null,replyTo:m.replyTo?{id:m.replyTo.id??null,authorName:m.replyTo.authorName??null,excerpt:String(m.replyTo.excerpt??'').slice(0,240),deleted:!!m.replyTo.deleted}:null};}
  function post(p,c){const id=p?.id??p?.postId;if(id==null)return null;return{id:String(id),channelId:c.id,channelKey:c.key,channelName:c.name,title:p.title??null,body:String(p.body??p.preview??p.content??'').slice(0,4000),authorName:p.authorName??p.author?.name??null,createdAt:p.createdAt??null,votes:p.votes??p.voteCount??null,status:p.status??null,tag:p.tag??null};}
  function merge(existing,added,cap=CAP){const byId=new Map();for(const x of [...existing,...added])if(x?.id&&x?.channelId)byId.set(x.channelId+':'+x.id,x);return [...byId.values()].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).slice(0,cap);}
  function search(rows,f={}){const q=String(f.text||'').toLowerCase(),author=String(f.author||'').toLowerCase();return rows.filter(x=>(!f.channel||x.channelKey===f.channel)&&(!q||String(x.title||'').toLowerCase().includes(q)||String(x.body||'').toLowerCase().includes(q))&&(!author||String(x.authorName||'').toLowerCase().includes(author))&&(!f.from||new Date(x.createdAt)>=new Date(f.from))&&(!f.to||new Date(x.createdAt)<=new Date(f.to+'T23:59:59'))&&(!f.hasReply||!!x.replyTo)&&(f.includeDeleted||!x.deleted)).sort((a,b)=>(f.sort==='oldest'?1:-1)*(new Date(a.createdAt||0)-new Date(b.createdAt||0)));}
  function url(c,{before,tag,status,sort}={}){if(!c||!KEYS.includes(c.key)||!['system_chat','system_forum'].includes(c.kind))throw Error('Only public/system channels are supported.');const base='/social/channels/'+encodeURIComponent(c.id)+'/'+(c.kind==='system_forum'?'posts':'messages'),params=new URLSearchParams();
    if(before)params.set('before',before);if(c.kind==='system_forum')for(const[k,v]of Object.entries({tag,status,sort}))if(v)params.set(k,v);return base+(params.size?'?'+params:'');}
  async function scan(c,read,{pages=1,before,tag,status,sort}={}){const limit=Math.max(1,Math.min(10,Number(pages)||1)),out=[];let cursor=before||null,n=0,seen=new Set();
    for(;n<limit;){const raw=list(await read(url(c,{before:cursor,tag,status,sort})));n++;if(!raw.length)break;
      const ids=raw.map(x=>x?.id??x?.messageId??x?.postId).filter(Boolean);if(!ids.length)break;
      for(const x of raw){const row=c.kind==='system_forum'?post(x,c):message(x,c);if(row&&!seen.has(row.id)){seen.add(row.id);out.push(row);}}
      const oldest=String(ids.at(-1));if(oldest===cursor)break;cursor=oldest;if(raw.length<50)break;
    }return{rows:out.slice(0,500),pagesFetched:n,before:cursor};
  }
  return{KEYS,CAP,channels,list,message,post,merge,search,url,scan};
});
