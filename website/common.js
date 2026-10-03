'use strict';
window.Arcade = (() => {
  let memory = {};
  const read = (key) => {try {const value=JSON.parse(localStorage.getItem('sidequest:'+key)||'[]');return Array.isArray(value)?value.filter(x=>typeof x==='string'):[];}catch{return memory[key]||[];}};
  const write = (key,value) => {memory[key]=value;try{localStorage.setItem('sidequest:'+key,JSON.stringify(value));}catch{toast('Storage unavailable. Saved for this visit only.');}};
  function toast(message){const el=document.querySelector('#toast');if(!el)return;el.textContent=message;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,3500);}
  const favorite=id=>{const items=read('favorites');write('favorites',items.includes(id)?items.filter(x=>x!==id):[...items,id]);};
  const recent=id=>write('recent',[id,...read('recent').filter(x=>x!==id)].slice(0,20));
  const play=id=>'player.html?id='+encodeURIComponent(id);
  function source(game){const url=new URL(game.source,location.href);if(url.protocol==='file:'&&location.protocol==='file:'&&game.type==='local'){const root=new URL('./',location.href);if(!url.href.startsWith(root.href))throw Error('Local game must be inside the website folder');return url;}if(!['http:','https:'].includes(url.protocol))throw Error('Unsupported source URL');if(game.type==='local' && url.origin!==location.origin)throw Error('Local games must use this site’s origin');return url;}
  let internal=false;
  document.addEventListener('click',event=>{const a=event.target.closest('a');if(a&&a.target!=='_blank'&&new URL(a.href,location.href).origin===location.origin&&!event.ctrlKey&&!event.metaKey){internal=true;setTimeout(()=>internal=false,1000);}});
  window.addEventListener('beforeunload',event=>{if(internal)return;event.preventDefault();event.returnValue='';});
  document.querySelectorAll('.random').forEach(button=>button.addEventListener('click',()=>{const games=window.GAMES||[];if(!games.length)return toast('No games in the catalog yet.');internal=true;location.href=play(games[Math.floor(Math.random()*games.length)].id);}));
  return {read,write,favorite,recent,play,source,toast};
})();
