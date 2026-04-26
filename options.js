const defaults={minDelay:20,maxDelay:45,maxActions:30,cooldownAfter:12,cooldownMinutes:5,scrollWait:3,reloadOnStop:false,skipVerified:false,skipProtected:false};
const $=id=>document.getElementById(id);

document.addEventListener("DOMContentLoaded",()=>chrome.storage.sync.get(defaults,d=>{
 minDelay.value=d.minDelay;
 maxDelay.value=d.maxDelay;
 maxActions.value=d.maxActions;
 cooldownAfter.value=d.cooldownAfter;
 cooldownMinutes.value=d.cooldownMinutes;
 scrollWait.value=d.scrollWait;
 reloadOnStop.checked=!!d.reloadOnStop;
 skipVerified.checked=!!d.skipVerified;
 skipProtected.checked=!!d.skipProtected;
}));

save.addEventListener("click",()=>{
 let min=clamp(minDelay.value,5,600,20), max=clamp(maxDelay.value,5,600,45);
 if(max<min)[min,max]=[max,min];

 const data={
  minDelay:min,
  maxDelay:max,
  maxActions:clamp(maxActions.value,1,1000,30),
  cooldownAfter:clamp(cooldownAfter.value,1,100,12),
  cooldownMinutes:clamp(cooldownMinutes.value,1,120,5),
  scrollWait:clamp(scrollWait.value,1,30,3),
  reloadOnStop:reloadOnStop.checked,
  skipVerified:skipVerified.checked,
  skipProtected:skipProtected.checked
 };

 chrome.storage.sync.set(data,()=>{
  status.textContent="Settings saved.";
  setTimeout(()=>status.textContent="",1800);
 });
});

function clamp(v,min,max,f){
 let n=parseInt(v,10);
 if(Number.isNaN(n))return f;
 return Math.max(min,Math.min(max,n));
}
