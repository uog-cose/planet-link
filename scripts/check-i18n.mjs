import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('src');
const files=[];
function walk(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name);const st=fs.statSync(p);if(st.isDirectory())walk(p);else if(/\.(tsx|ts)$/.test(name))files.push(p)}}
walk(root);
const hits=[];
for(const file of files){const s=fs.readFileSync(file,'utf8');for(const m of s.matchAll(/>\s*([A-Za-z][^<{]{2,120})\s*</g)){const text=m[1].replace(/\s+/g,' ').trim();if(text&&!/^(?:[a-z]+===|api|set[A-Z]|void|window|return|navigate|prev|x\.)/.test(text))hits.push(`${path.relative(root,file)}: ${text}`)}}
console.log(`i18n scan: ${hits.length} candidate literal UI strings`);for(const x of hits.slice(0,200))console.log(x);if(hits.length>200)console.log(`... ${hits.length-200} more`);
