import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {formatStars,validCount} from '../public/marketing/stars-data.mjs';

// Local CLI credentials never reach the page; only the public count is saved.
const {stargazers_count:count}=JSON.parse(execFileSync('gh',['api','repos/FrigadeHQ/yogurt'],{encoding:'utf8'}));
assert.ok(validCount(count),'Invalid count');
const home=new URL('../content/home.html',import.meta.url);
let html=readFileSync(home,'utf8');
const number=/<span class="stars-count" data-star-count="\d+">[^<]*<\/span>/g;
const label=/aria-label="View Yogurt on GitHub, [\d,]+ stars"/g;
assert.equal([...html.matchAll(number)].length,1,'Expected one baked star count');
assert.equal([...html.matchAll(label)].length,1,'Expected one star button label');
html=html.replace(number,`<span class="stars-count" data-star-count="${count}">${formatStars(count,'en')}</span>`)
  .replace(label,`aria-label="View Yogurt on GitHub, ${new Intl.NumberFormat('en').format(count)} stars"`);
writeFileSync(new URL('../content/stars.json',import.meta.url),JSON.stringify({capturedAt:new Date().toISOString(),count},null,2)+'\n');
writeFileSync(home,html);
console.log(`Saved ${count} stars to the snapshot and static home page.`);
