import {formatStars,refreshStars} from './stars-data.mjs';

const widget=document.querySelector('[data-stars-button]');
const number=widget.querySelector('[data-star-count]');
let count=Number(number.dataset.starCount),frame,started=false,running=false,observer;
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const draw=value=>{number.textContent=formatStars(value,navigator.language)};
const label=()=>{
  widget.setAttribute('aria-label',`View Yogurt on GitHub, ${new Intl.NumberFormat(navigator.language).format(count)} stars`);
};
function finish(){
  cancelAnimationFrame(frame);running=false;draw(count);
}
function enter(){
  if(started)return;
  started=true;
  if(reduce.matches){finish();return}
  running=true;
  const start=performance.now();
  const tick=now=>{
    const progress=Math.min(1,(now-start)/600);
    draw(Math.round(count*(1-(1-progress)**3)));
    if(progress<1)frame=requestAnimationFrame(tick);
    else{running=false;draw(count)}
  };
  draw(0);frame=requestAnimationFrame(tick);
}
// The count keeps its final width while it counts up, so nothing beside it moves and no gap is left once it lands.
const hold=()=>{if(number.style)number.style.minInlineSize=`${formatStars(count).length}ch`};
hold();draw(count);label();
if(!reduce.matches){
  observer=new IntersectionObserver(([entry])=>{
    if(entry.isIntersecting){enter();observer.disconnect()}
  },{threshold:.5});
  observer.observe(widget);
}
reduce.addEventListener('change',()=>{if(reduce.matches){started=true;observer?.disconnect();finish()}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)finish()});
let storage;
try{storage=localStorage}catch{}
const fallback={count};
refreshStars(fallback,{storage,getJSON:async url=>{
  const response=await fetch(url,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('GitHub unavailable');
  return response.json();
}}).then(data=>{
  count=data.count;hold();label();if(!running)draw(count);
});
