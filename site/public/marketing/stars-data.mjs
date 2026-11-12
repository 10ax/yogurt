export const repoAPI='https://api.github.com/repos/FrigadeHQ/yogurt';
export const cacheKey='yogurt-github-stars-v1';
export const hour=60*60*1000;
export const validCount=value=>Number.isSafeInteger(value)&&value>=0;
export function formatStars(count,locale){
  return new Intl.NumberFormat(locale,count>9999?{notation:'compact',maximumFractionDigits:1}:{maximumFractionDigits:0}).format(count);
}
export async function refreshStars(fallback,{storage,getJSON,now=Date.now()}={}){
  let cached;
  try{cached=JSON.parse(storage.getItem(cacheKey))}catch{}
  const saved=cached?.data;
  const data={count:validCount(saved?.count)?saved.count:fallback.count};
  if(Number.isFinite(cached?.at)&&now>=cached.at&&now-cached.at<hour)return data;
  const save=()=>{try{storage.setItem(cacheKey,JSON.stringify({at:now,data}))}catch{}};
  save(); // Failed attempts also wait an hour before retrying.
  try{
    const repo=await getJSON(repoAPI);
    if(!validCount(repo.stargazers_count))throw Error('Invalid count');
    data.count=repo.stargazers_count;
  }catch{}
  save();
  return data;
}
