(function(){
"use strict";
function ready(fn){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",fn);else fn();}
ready(function(){
  var body=document.body, path=location.pathname;
  var isBrief=!!document.querySelector("article");
  var list=document.querySelectorAll("body > .wrap article, body > .wrap .toc > li");
  var hasPosts=/posts\.html$/.test(path)||/\/category\//.test(path)||/\/guide\//.test(path)||isBrief;
  if(hasPosts && list.length){
    var h=document.querySelector(".wrap > h1");
    var cat=document.querySelector(".catnav");
    var bar=document.createElement("div");
    bar.className="site-tools";
    bar.innerHTML='<label class="searchbox"><span aria-hidden="true">⌕</span><input type="search" placeholder="搜索本站内容…" aria-label="搜索本站内容"></label><button type="button" class="clear-search" hidden>清除</button><span class="result-count" aria-live="polite"></span>';
    if(cat) cat.insertAdjacentElement("afterend",bar);
    else if(h) h.insertAdjacentElement("afterend",bar);
    var input=bar.querySelector("input"), clear=bar.querySelector(".clear-search"), count=bar.querySelector(".result-count");
    function norm(s){return (s||"").toLowerCase().replace(/\s+/g,"");}
    function run(){
      var q=norm(input.value), shown=0;
      Array.prototype.forEach.call(list,function(el){
        var hit=!q||norm(el.innerText).indexOf(q)>=0;
        el.hidden=!hit;
        if(hit) shown++;
      });
      clear.hidden=!q;
      count.textContent=q ? ("找到 "+shown+" 项") : "";
    }
    input.addEventListener("input",run);
    clear.addEventListener("click",function(){input.value="";run();input.focus();});

    if(isBrief && cat){
      var filter=document.createElement("select");
      filter.className="category-filter";
      filter.setAttribute("aria-label","按类别筛选");
      var all=document.createElement("option");all.value="";all.textContent="全部类别";filter.appendChild(all);
      var seen={};
      Array.prototype.forEach.call(document.querySelectorAll("article h1[class*='cat-']"),function(h){
        var m=(h.className.match(/cat-([a-z0-9_]+)/)||[])[1];
        if(!m||seen[m])return;seen[m]=1;
        var o=document.createElement("option");o.value=m;o.textContent=(h.querySelector(".chip")||{}).innerText||m;filter.appendChild(o);
      });
      bar.appendChild(filter);
      filter.addEventListener("change",function(){
        var c=filter.value;
        Array.prototype.forEach.call(list,function(el){
          var match=!c||!!el.querySelector(".cat-"+c);
          el.hidden=!match;
        });
        run();
      });
    }
  }

  if(isBrief){
    var articles=document.querySelectorAll("article");
    if(articles.length>2){
      var nav=document.createElement("aside");
      nav.className="today-focus";
      var title=document.createElement("strong");
      title.textContent="今日快速入口";
      nav.appendChild(title);
      var ol=document.createElement("ol");
      Array.prototype.slice.call(articles,0,5).forEach(function(a){
        var h=a.querySelector("h1.art");
        if(!h)return;
        var li=document.createElement("li"), link=document.createElement("a");
        link.href="#article-"+Array.prototype.indexOf.call(articles,a);
        link.textContent=(h.innerText||"").replace(/^\S+\s*/,"");
        li.appendChild(link);ol.appendChild(li);
        a.id="article-"+Array.prototype.indexOf.call(articles,a);
      });
      nav.appendChild(ol);
      var first=document.querySelector(".site-tools")||document.querySelector(".catnav");
      if(first) first.insertAdjacentElement("afterend",nav);
    }
  }

  var progress=document.createElement("div");progress.className="read-progress";
  document.body.appendChild(progress);
  function scrollUI(){
    var doc=document.documentElement, max=doc.scrollHeight-doc.clientHeight;
    progress.style.width=(max>0?Math.min(100,window.scrollY/max*100):0)+"%";
    topBtn.hidden=window.scrollY<500;
  }
  window.addEventListener("scroll",scrollUI,{passive:true});
  var topBtn=document.createElement("button");
  topBtn.className="back-top";topBtn.type="button";topBtn.textContent="↑";
  topBtn.title="回到顶部";topBtn.setAttribute("aria-label","回到顶部");topBtn.hidden=true;
  topBtn.addEventListener("click",function(){window.scrollTo({top:0,behavior:"smooth"});});
  document.body.appendChild(topBtn);scrollUI();
});
})();