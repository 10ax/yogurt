export const question='When is the copy due?';
export const summaryTimes=[.38,.72,1.29,1.92];
export const summaryReady=2.6;
export const stepDurations=[2.9,2.8,4];
let keyTime=.36;
const keys=[...question].map((character,index)=>keyTime+=.047+(index%4)*.012+(character===' '?.035:0));
export const sendAt=keys.at(-1)+.5;
export const sentAt=sendAt+.24;
export const answerAt=sentAt+1.1;
export function questionFrame(time){
  if(time===Infinity) return {text:question,send:'sent',answer:true};
  const count=keys.filter(at=>at<=time).length;
  return {
    text:time<sentAt?question.slice(0,count):'',
    send:time<keys[0]?'ready':time<keys.at(-1)?'typing':time<sendAt?'ready':time<sentAt?'press':time<answerAt?'loading':'sent',
    answer:time>=answerAt,
  };
}

// Fictional meeting timing: replies, short interruptions, overlap, and unequal pauses.
const turns=[[0,0,2.7],[2,2.25,3.8],[0,4.1,5.35],[1,5.3,8.55],[0,7.95,8.7],[2,9.5,12.9],[1,12.65,13.4],[0,14.15,17.6],[2,17.55,18.6],[0,18.8,20.2],[1,20.15,22.8]];
export function speakerEnvelopes(time){
  const at=time%24,levels=[0,0,0];
  for(const [person,start,end] of turns){
    const edge=Math.max(0,Math.min((at-start)/.18,(end-at)/.36,1));
    const envelope=edge*edge*(3-2*edge);
    levels[person]=Math.max(levels[person],envelope);
  }
  return levels;
}
