'use strict';
document.querySelectorAll('[data-open-blank]').forEach(button=>button.addEventListener('click',()=>{
  const tab=window.open('about:blank','_blank');
  if(!tab){window.Arcade?.toast('Allow pop-ups for this site, then try again.');return;}
  const doc=tab.document;
  doc.title='Sidequest';
  doc.documentElement.lang='en';
  doc.body.style.cssText='margin:0;background:#14111d;overflow:hidden';
  const frame=doc.createElement('iframe');
  frame.src=['media','ai'].includes(document.body.dataset.service) ? location.href : new URL('index.html',location.href).href;
  frame.title='Sidequest';
  frame.style.cssText='display:block;width:100vw;height:100vh;border:0';
  frame.allow='fullscreen; clipboard-write';
  frame.setAttribute('allowfullscreen','');
  doc.body.append(frame);
  // Prevent the framed site from navigating the original tab through window.opener.
  tab.opener=null;
  window.Arcade?.toast(location.protocol==='file:'?'If the blank tab stays empty, use the hosted site.':'Opened in a new about:blank tab.');
}));
