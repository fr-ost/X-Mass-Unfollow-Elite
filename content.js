let running=false, paused=false, count=0, scanned=0, mode="Idle", nonFollowersOnly=true, seen=new Set();
const defaults={minDelay:20,maxDelay:45,maxActions:30,cooldownAfter:12,cooldownMinutes:5,scrollWait:3,reloadOnStop:false,skipVerified:false,skipProtected:false};

chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
 if(msg.action==="START_NON_FOLLOWERS"){start(true);sendResponse(state("Started: Non Followers",true));return true}
 if(msg.action==="START_ALL"){start(false);sendResponse(state("Started: All",true));return true}
 if(msg.action==="PAUSE"){paused=true;notify("Paused");sendResponse(state("Paused",true));return true}
 if(msg.action==="RESUME"){paused=false;notify("Resumed");sendResponse(state("Resumed",true));return true}
 if(msg.action==="STOP"){stop("Stopped manually.");sendResponse(state("Stopped",false));return true}
});

function start(nf){
 if(running)return;
 running=true; paused=false; count=0; scanned=0; seen.clear(); nonFollowersOnly=nf; mode=nf?"Non Followers":"All";
 notify("Running: "+mode); loop();
}

async function stop(message="Stopped."){
 running=false; paused=false; mode="Idle";
 chrome.runtime.sendMessage({type:"STOPPED",message,count,scanned}).catch(()=>{});
 const s=await chrome.storage.sync.get(defaults);
 if(s.reloadOnStop) location.reload();
}

async function loop(){
 const s=await chrome.storage.sync.get(defaults);
 while(running && count<s.maxActions){
  if(paused){await sleep(500);continue}
  const btn=findCandidateButton(s);
  if(!btn){notify("No matching account visible. Scrolling..."); window.scrollBy({top:Math.round(innerHeight*.85),behavior:"smooth"}); await sleep(s.scrollWait*1000); continue}
  const username=getUsername(btn)||("unknown_"+scanned);
  if(seen.has(username)){window.scrollBy({top:500,behavior:"smooth"}); await sleep(800); continue}
  seen.add(username); scanned++;
  btn.scrollIntoView({block:"center",behavior:"smooth"}); await sleep(randomInt(600,1300));
  btn.click(); await sleep(randomInt(900,1700));
  const confirm=await waitForConfirm(5000);
  if(!confirm){notify("Confirm button not found. Skipping."); await sleep(1200); continue}
  confirm.click(); count++; notify(username.startsWith("unknown_")?"Unfollowed account":"Unfollowed @"+username);
  if(count>=s.maxActions||!running)break;
  if(count%s.cooldownAfter===0){notify("Cooldown: "+s.cooldownMinutes+" minute(s)"); await sleep(s.cooldownMinutes*60*1000)}
  const delay=randomInt(s.minDelay,s.maxDelay); notify("Waiting "+delay+"s before next action..."); await sleep(delay*1000);
 }
 stop("Finished. Total unfollowed: "+count);
}

function findCandidateButton(s){
 const buttons=[...document.querySelectorAll('button,div[role="button"]')];
 return buttons.find(btn=>{
  if(!isVisible(btn))return false;
  const text=(btn.innerText||btn.textContent||"").trim().toLowerCase();
  const aria=(btn.getAttribute("aria-label")||"").toLowerCase();
  const tid=(btn.getAttribute("data-testid")||"").toLowerCase();
  const following=text==="following"||tid.endsWith("-unfollow")||tid.includes("unfollow")||aria.includes("following");
  if(!following)return false;
  const u=getUsername(btn);
  const rowText=getRowText(btn);
  if(nonFollowersOnly && rowText.includes("follows you"))return false;
  if(s.skipVerified && (rowText.includes("verified") || btn.closest('[aria-label*="Verified"]')))return false;
  if(s.skipProtected && (rowText.includes("protected") || rowText.includes("private")))return false;
  return true;
 });
}
function getRowText(btn){let n=btn;let txt="";for(let i=0;i<8&&n;i++){txt+=" "+(n.innerText||"");n=n.parentElement}return txt.toLowerCase()}
function getUsername(btn){const a=btn.getAttribute("aria-label")||"";let m=a.match(/@([A-Za-z0-9_]+)/);if(m)return m[1].toLowerCase();let n=btn;for(let i=0;i<8&&n;i++){m=(n.innerText||"").match(/@([A-Za-z0-9_]+)/);if(m)return m[1].toLowerCase();n=n.parentElement}return ""}
async function waitForConfirm(ms){const start=Date.now();while(Date.now()-start<ms){const b=[...document.querySelectorAll('button,div[role="button"]')].find(x=>{if(!isVisible(x))return false;const t=(x.innerText||x.textContent||"").trim().toLowerCase();const id=(x.getAttribute("data-testid")||"").toLowerCase();return t==="unfollow"||id.includes("confirmationsheetconfirm")});if(b)return b;await sleep(250)}return null}
function isVisible(el){const r=el.getBoundingClientRect(),st=getComputedStyle(el);return r.width>0&&r.height>0&&st.display!=="none"&&st.visibility!=="hidden"&&r.bottom>0&&r.top<innerHeight}
function state(message,runningState){return{message,running:runningState,count,scanned,mode}}
function notify(message){chrome.runtime.sendMessage({type:"PROGRESS",message,count,scanned,mode}).catch(()=>{});console.log("[X Unfollow Elite]",message)}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function randomInt(min,max){min=Number(min)||20;max=Number(max)||45;if(max<min)[min,max]=[max,min];return Math.floor(Math.random()*(max-min+1))+min}
