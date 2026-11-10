import {onVoiceFrame} from './clock.mjs';
import {speakerEnvelopes} from './timing.mjs';

const reduce=matchMedia('(prefers-reduced-motion: reduce)'),phone=matchMedia('(max-width:760px)');
const cards=[...document.querySelectorAll('.fragment-art')].map(element=>({element,frame:null,ready:false,visible:false,elapsed:0,duration:Number(element.dataset.duration)}));
let active=0;
const send=(card,time)=>card.frame?.contentWindow?.postMessage({type:'yogurt-fragment-time',seconds:time},location.origin);
function finish(card){
  delete card.element.dataset.phase;delete card.element.dataset.live;card.element.dataset.complete='true';card.element.closest('.step').dataset.active='false';send(card,99);
}
function finishAll(){cards.forEach(card=>{finish(card);card.frame?.remove();card.frame=null;card.ready=false;delete card.element.dataset.live;card.elapsed=0;});active=0;}
function render(card,time){card.element.dataset.phase='writing';send(card,time);}
function load(card){
  if(card.frame||phone.matches||reduce.matches)return;
  const frame=document.createElement('iframe');frame.title='Fictional Yogurt '+card.element.dataset.fragment;
  frame.tabIndex=-1;frame.inert=true;frame.setAttribute('aria-hidden','true');frame.setAttribute('sandbox','allow-scripts allow-same-origin');
  frame.src='/marketing/app/frame.html?fragment='+card.element.dataset.fragment+'&animate';card.frame=frame;card.element.append(frame);
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.data?.type!=='yogurt-fragment-ready')return;
  const card=cards.find(card=>card.frame?.contentWindow===event.source);
  if(!card||card.ready)return;card.ready=true;send(card,0);
});
const warm=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)load(cards.find(card=>card.element===entry.target));},{rootMargin:'400px'});
cards.forEach(card=>warm.observe(card.element));
const visible=new IntersectionObserver(entries=>{
  for(const entry of entries){const card=cards.find(card=>card.element===entry.target);card.visible=entry.isIntersecting&&entry.intersectionRatio>=.35;}
},{threshold:[0,.35]});
cards.forEach(card=>visible.observe(card.element));
cards.forEach(finish);
if(reduce.matches||phone.matches)finishAll();
const modeChanged=()=>{finishAll();if(!phone.matches&&!reduce.matches)cards.filter(card=>card.visible).forEach(load);};
reduce.addEventListener('change',modeChanged);phone.addEventListener('change',modeChanged);

const roster=document.querySelector('.roster-asset'),people=[...roster.querySelectorAll('.roster-person')];
const meters=people.map(person=>[...person.querySelectorAll('.roster-level i')]);
const recorder=[...roster.querySelectorAll('.outside-recorder .roster-level i')];
let rosterVisible=false,rosterElapsed=0,lastPhase;
new IntersectionObserver(([entry])=>{rosterVisible=entry.isIntersecting&&entry.intersectionRatio>=.35;},{threshold:[0,.35]}).observe(roster);
function drawRoster(level,bands,still=false){
  const envelopes=still?[0,0,0]:speakerEnvelopes(rosterElapsed);
  roster.dataset.speaking=String(envelopes.some(value=>value>.02));
  people.forEach((person,index)=>{
    person.dataset.speaking=String(envelopes[index]>.02);
    person.style.setProperty('--voice',envelopes[index].toFixed(4));
  });
  recorder.forEach((bar,index)=>{
    const values=envelopes.map((envelope,person)=>envelope*(.2+.8*level)*[.54,.8,1,.72,.42][index]*(.65+.35*bands[(index+person)%3]));
    const transform=value=>`scaleY(${((3+19*value)/22).toFixed(5)})`;
    bar.style.transform=transform(Math.max(...values));
    meters.forEach((meter,person)=>meter[index].style.transform=transform(values[person]));
  });
}
drawRoster(0,[0,0,0],true);
onVoiceFrame(({phase,level,bands})=>{
  const delta=lastPhase===undefined?0:Math.max(0,Math.min(phase-lastPhase,.1));lastPhase=phase;
  if(reduce.matches){drawRoster(0,[0,0,0],true);return;}
  if(document.hidden)return;
  const card=cards[active];
  if(!phone.matches&&cards.some(card=>card.visible)&&card?.ready){
    card.element.closest('.step').dataset.active='true';card.elapsed+=delta;
    card.element.dataset.complete=String(card.elapsed>=card.duration);
    render(card,card.elapsed>=card.duration?99:card.elapsed);
    // Reveal only after the first content has arrived underneath the finished still.
    if(card.elapsed>=1.05&&card.elapsed<card.duration)card.element.dataset.live='true';
    else if(card.elapsed>=card.duration)delete card.element.dataset.live;
    if(card.elapsed>=card.duration+.9){
      finish(card);card.elapsed=0;active=(active+1)%cards.length;
      // Transcript accumulates final lines; reset its hidden frame behind the completed still.
      if(card.element.dataset.fragment==='transcript'){card.frame.remove();card.frame=null;card.ready=false;load(card);}
    }
  }
  if(rosterVisible){rosterElapsed+=delta;drawRoster(level,bands);}
});
