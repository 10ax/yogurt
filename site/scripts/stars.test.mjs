import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import vm from 'node:vm';
import {cacheKey,hour,formatStars,refreshStars} from '../public/marketing/stars-data.mjs';

const snapshot=JSON.parse(readFileSync(new URL('../content/stars.json',import.meta.url)));
const html=readFileSync(new URL('../content/home.html',import.meta.url),'utf8');
assert.equal((html.match(/data-star-count=/g)||[]).length,1);
assert.ok(html.includes(`data-star-count="${snapshot.count}">${formatStars(snapshot.count,'en')}</span>`));
assert.ok(html.includes(`aria-label="View Yogurt on GitHub, ${new Intl.NumberFormat('en').format(snapshot.count)} stars"`));
assert.ok(html.includes('src="/marketing/stars.mjs"'));
assert.ok(!/data-stars=|<!--stars-|stars-avatars|stars-preview/.test(html));
assert.ok(!existsSync(new URL('../content/stars-preview.mjs',import.meta.url)));
const route=readFileSync(new URL('../app/route.ts',import.meta.url),'utf8');
assert.ok(route.includes("'force-static'"));
assert.ok(!route.includes('searchParams'));
assert.equal(formatStars(9999,'en-US'),'9,999');
assert.equal(formatStars(9999,'de-DE'),'9.999');
assert.equal(formatStars(10200,'en-US'),'10.2K');
const memory=new Map(),storage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
let calls=0;
const failure=async()=>{calls++;throw Error('offline')};
assert.deepEqual(await refreshStars(snapshot,{storage,getJSON:failure,now:1}),{count:snapshot.count});
await refreshStars(snapshot,{storage,getJSON:failure,now:2});
assert.equal(calls,1,'Failed requests must also be throttled');
const live=await refreshStars(snapshot,{storage,now:hour+2,getJSON:async()=>({stargazers_count:900})});
assert.equal(live.count,900);
await refreshStars(snapshot,{storage,now:hour+3,getJSON:()=>assert.fail('Fresh cache must skip network')});
const stale=await refreshStars(snapshot,{storage,now:2*hour+3,getJSON:failure});
assert.equal(stale.count,900,'Offline refresh retains the last good value');
memory.set(cacheKey,'broken JSON');
assert.equal((await refreshStars(snapshot,{storage,getJSON:failure})).count,snapshot.count);
assert.equal((await refreshStars(snapshot,{storage:{getItem(){throw Error()},setItem(){throw Error()}},getJSON:failure})).count,snapshot.count);
assert.equal((await refreshStars(snapshot,{getJSON:async()=>({stargazers_count:-1})})).count,snapshot.count);

const script=readFileSync(new URL('../public/marketing/stars.mjs',import.meta.url),'utf8').replace(/^import .*;\n/,'');
function page({reduced=false,blocked=false}={}){
  const number={dataset:{starCount:'804'},textContent:'804',style:{}},frames=new Map(),events={},motionEvents={};
  let observer,sequence=0,refresh;
  const widget={querySelector:()=>number,setAttribute(key,value){this[key]=value}};
  const document={hidden:false,querySelector:()=>widget,addEventListener:(name,fn)=>events[name]=fn};
  const motion={matches:reduced,addEventListener:(name,fn)=>motionEvents[name]=fn};
  const context={document,navigator:{language:'en-US'},Intl,matchMedia:()=>motion,performance:{now:()=>0},formatStars,
    refreshStars:()=>new Promise(resolve=>refresh=resolve),
    requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence},cancelAnimationFrame:id=>frames.delete(id),
    IntersectionObserver:class{constructor(fn){observer=this;this.fn=fn}observe(){}disconnect(){this.disconnected=true}},
  };
  Object.defineProperty(context,'localStorage',{get(){if(blocked)throw Error('denied');return storage}});
  vm.runInNewContext(script,context);
  const tick=time=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time))};
  return {number,frames,events,motionEvents,motion,document,observer,widget,tick,refresh};
}
const p=page({blocked:true});
assert.equal(p.number.textContent,'804');
assert.equal(p.number.style.minInlineSize,'3ch');
p.observer.fn([{isIntersecting:false}]);assert.equal(p.frames.size,0);
p.observer.fn([{isIntersecting:true}]);assert.equal(p.number.textContent,'0');
assert.equal(p.number.style.minInlineSize,'3ch','The final width is held throughout count-up');
p.tick(300);assert.equal(p.number.textContent,'704');
p.tick(600);assert.equal(p.number.textContent,'804');assert.equal(p.frames.size,0);
p.observer.fn([{isIntersecting:true}]);assert.equal(p.frames.size,0,'Entrance happens once');
assert.equal(p.widget['aria-label'],'View Yogurt on GitHub, 804 stars');
const reduced=page({reduced:true});assert.equal(reduced.frames.size,0);assert.equal(reduced.observer,undefined);assert.equal(reduced.number.textContent,'804');
for(const reason of ['hidden','reduced']){
  const active=page();active.observer.fn([{isIntersecting:true}]);
  if(reason==='hidden'){active.document.hidden=true;active.events.visibilitychange()}
  else{active.motion.matches=true;active.motionEvents.change()}
  assert.equal(active.frames.size,0);assert.equal(active.number.textContent,'804');
}
p.refresh({count:10200});
await Promise.resolve();
assert.equal(p.number.textContent,'10.2K');
assert.equal(p.number.style.minInlineSize,'5ch');
assert.equal(p.widget['aria-label'],'View Yogurt on GitHub, 10,200 stars');
assert.equal(p.frames.size,0,'Live refresh never restarts the count-up');
console.log('Static snapshot, locale, cache/failures, denied storage, held width, once-only animation and reduced motion passed.');
