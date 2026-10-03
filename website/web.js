'use strict';
const frame=document.querySelector('#web-frame'),status=document.querySelector('#web-state');
const timer=setTimeout(()=>{status.textContent='Web is taking longer to load. Try opening it in a separate tab below.';},15000);
frame.addEventListener('load',()=>{clearTimeout(timer);status.hidden=true;});
frame.addEventListener('error',()=>{clearTimeout(timer);status.textContent='Web could not load. Try the separate-tab link below.';});
