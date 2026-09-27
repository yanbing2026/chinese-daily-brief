import fs from "node:fs";
import path from "node:path";
const root=process.cwd(), files=[];
function walk(dir){ for(const name of fs.readdirSync(dir)){ if([".git","node_modules"].includes(name)) continue; const p=path.join(dir,name), st=fs.statSync(p); if(st.isDirectory()) walk(p); else files.push(p); } }
walk(root);
const html=files.filter(f=>f.endsWith(".html")), errors=[];
for(const file of html){
 const text=fs.readFileSync(file,"utf8"), rel=path.relative(root,file);
 if(!text.includes('name="viewport"')) errors.push(rel+": missing viewport");
 if(!/<title>[^<]+<\/title>/i.test(text)) errors.push(rel+": missing title");
 for(const m of text.matchAll(/(?:href|src)="([^"]+)"/gi)){
  const u=m[1]; if(/^(https?:|mailto:|tel:|#|data:|javascript:)/i.test(u)) continue;
  const target=path.resolve(path.dirname(file),u.split("#")[0].split("?")[0]);
  if(u && !fs.existsSync(target)) errors.push(rel+": broken local reference "+u);
 }
}
// 前端契约（见 SITE_ARCHITECTURE.md）：每一页都必须加载共享样式与交互脚本。
// 这两样是"生成物/共享资源"，缺了页面看着正常、功能却静默消失。
for(const file of html){
 const text=fs.readFileSync(file,"utf8"), rel=path.relative(root,file);
 if(!text.includes("assets/style.css")) errors.push(rel+": style.css is not loaded");
 if(!text.includes("assets/site-v2.js")) errors.push(rel+": site-v2.js is not loaded");
}
if(errors.length){ console.error("SITE VALIDATION FAILED"); errors.forEach(e=>console.error("- "+e)); process.exit(1); }
console.log("SITE VALIDATION OK — "+html.length+" HTML files checked.");
