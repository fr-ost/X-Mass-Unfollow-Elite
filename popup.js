const countEl=document.getElementById("count"), scannedEl=document.getElementById("scanned"), statusEl=document.getElementById("statusText"), modeEl=document.getElementById("modeText"), dot=document.getElementById("dot");
function setStatus(text,state="ready"){statusEl.textContent=text;dot.className="";if(state==="running")dot.classList.add("running");if(state==="stopped")dot.classList.add("stopped")}
async function send(action){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.id){setStatus("No active tab","stopped");return}
 if(!/^https:\/\/(x|twitter)\.com\//.test(tab.url||"")){setStatus("Open X/Twitter first","stopped");return}
 chrome.tabs.sendMessage(tab.id,{action},res=>{
  if(chrome.runtime.lastError){setStatus("Refresh the X page first","stopped");return}
  if(res?.count!==undefined)countEl.textContent=res.count;
  if(res?.scanned!==undefined)scannedEl.textContent=res.scanned;
  if(res?.mode)modeEl.textContent="Mode: "+res.mode;
  setStatus(res?.message||"Command sent",res?.running?"running":"ready");
 });
}
document.getElementById("nonFollowers").addEventListener("click",()=>send("START_NON_FOLLOWERS"));
document.getElementById("all").addEventListener("click",()=>send("START_ALL"));
document.getElementById("pause").addEventListener("click",()=>send("PAUSE"));
document.getElementById("resume").addEventListener("click",()=>send("RESUME"));
document.getElementById("stop").addEventListener("click",()=>send("STOP"));
document.getElementById("settings").addEventListener("click",()=>chrome.runtime.openOptionsPage());
chrome.runtime.onMessage.addListener(msg=>{
 if(msg.type==="PROGRESS"){
  countEl.textContent=msg.count??0; scannedEl.textContent=msg.scanned??0; modeEl.textContent="Mode: "+(msg.mode||"Running"); setStatus(msg.message||"Running","running");
 }
 if(msg.type==="STOPPED"){countEl.textContent=msg.count??0; scannedEl.textContent=msg.scanned??0; setStatus(msg.message||"Stopped","stopped"); modeEl.textContent="Mode: Idle";}
});

document.getElementById("contact").addEventListener("click",()=>chrome.tabs.create({url:"https://t.me/igfrostt"}));
