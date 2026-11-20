
import { firebaseConfig, ADMIN_EMAIL, FIREBASE_CONFIGURED, IMAGE_HOST } from "./firebase-config.js";
import { ACCEPT, FRAME, validateFile, hostReady, uploadToHost, openImageEditor, fitMarkup, logoMarkup, plainLogoMarkup, focalMarkup, specFor, sanitizeSpec, isHttpUrl, isRenderableUrl } from "./image-editor.js";

const STARTER_GAMES = [
 {id:"gta-v",title:"GTA V",shortDescription:"Explore Los Santos in the iconic open-world action experience.",description:"Grand Theft Auto V — an open-world action experience set in the sprawling city of Los Santos. This entry opens an externally hosted game page.",category:"Action",url:"https://fiveplay.lol/",cover:"https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=85",logo:"",screenshots:[],featured:true,published:true,createdAt:1},
 {id:"gta-v-high",title:"GTA V High Edition",shortDescription:"A separate high-graphics GTA V experience.",description:"A separate listing for the high-graphics version supplied by the site owner. Performance and compatibility depend on the external host.",category:"Action",url:"https://playgta5.pro/play?mode=sandbox&cfg=1",cover:"https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=85",logo:"",screenshots:[],featured:true,published:true,createdAt:2},
 {id:"vice-city",title:"GTA Vice City",shortDescription:"Neon nights, palm trees and an unmistakable 1980s atmosphere.",description:"Visit the Vice City game page supplied by the site owner. This game is hosted externally.",category:"Action",url:"https://quenq.com/apps/vice-city/",cover:"https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1200&q=85",logo:"",screenshots:[],featured:true,published:true,createdAt:3},
 {id:"gta-iii",title:"GTA III",shortDescription:"A classic open-world crime adventure in Liberty City.",description:"Visit the GTA III game page supplied by the site owner. This game is hosted externally.",category:"Action",url:"https://quenq.com/apps/gta-3/",cover:"https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1200&q=85",logo:"",screenshots:[],featured:false,published:true,createdAt:4},
 {id:"chinatown-wars",title:"GTA Chinatown Wars",shortDescription:"A handheld Grand Theft Auto adventure.",description:"Visit the RetroGames page supplied by the site owner. Availability may depend on browser support and the external host.",category:"Action",url:"https://www.retrogames.cc/nds-games/grand-theft-auto-chinatown-wars-usa-en-fr-de-es-it.html",cover:"https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=85",logo:"",screenshots:[],featured:false,published:true,createdAt:5},
 {id:"liberty-city-stories",title:"GTA Liberty City Stories",shortDescription:"Coming soon — the game link will be added by the administrator.",description:"This game is prepared as a draft. Add a working destination URL from the admin dashboard before publishing.",category:"Action",url:"",cover:"https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1200&q=85",logo:"",screenshots:[],featured:false,published:false,createdAt:6}
];

const DEFAULT_SETTINGS = {
 community:{youtube:"https://www.youtube.com/@Winjo_Gamerz",like:"",comment:"",discord:"https://discord.gg/srtJVaprYj",enabled:{youtube:true,like:true,comment:true,discord:true}},
 homepage:{heading:"ENTER YOUR GAMING WORLD.",subtitle:"Discover your next adventure. One destination, a growing universe of games.",heroImage:"",heroFit:null,communityText:"Join the GAMEVERSE community and stay connected."},
 contact:{discord:"https://discord.gg/srtJVaprYj",youtube:"https://www.youtube.com/@Winjo_Gamerz",heading:"LET'S CONNECT",description:"Need help, found a broken link or have a game suggestion? Join our Discord community."},
 ads:{
  enabled:false,
  adsense:{enabled:false,approved:false,publisherId:"",slots:{homeTop:"",homeBottom:"",gamesTop:"",gamesBottom:"",gameTop:"",gameBottom:""}},
  directEnabled:false,
  directCampaigns:[]
 },
 imageHost:{provider:"cloudinary",cloudName:"",uploadPreset:"",folder:"gameverse"},
 mediaLibrary:[],
 downloads:{enabled:true,items:[]}
};

function mergeSettings(d){
 d=d||{};
 return {
  ...structuredClone(DEFAULT_SETTINGS),
  ...d,
  community:{...DEFAULT_SETTINGS.community,...d.community,enabled:{...DEFAULT_SETTINGS.community.enabled,...d.community?.enabled}},
  homepage:{...DEFAULT_SETTINGS.homepage,...d.homepage},
  contact:{...DEFAULT_SETTINGS.contact,...d.contact},
  ads:{
   ...DEFAULT_SETTINGS.ads,...d.ads,
   adsense:{...DEFAULT_SETTINGS.ads.adsense,...d.ads?.adsense,slots:{...DEFAULT_SETTINGS.ads.adsense.slots,...d.ads?.adsense?.slots}},
   directCampaigns:Array.isArray(d.ads?.directCampaigns)?d.ads.directCampaigns:[]
  },
  imageHost:{...DEFAULT_SETTINGS.imageHost,...(IMAGE_HOST||{}),...d.imageHost},
  mediaLibrary:Array.isArray(d.mediaLibrary)?d.mediaLibrary:[],
  downloads:{...DEFAULT_SETTINGS.downloads,...d.downloads,items:Array.isArray(d.downloads?.items)?d.downloads.items:[]},
  features:{...DEFAULT_SETTINGS.features,...d.features}
 };
}

let state={games:[...STARTER_GAMES],settings:structuredClone(DEFAULT_SETTINGS),user:null,adminTab:"overview",editingId:null,fb:null};

const $=s=>document.querySelector(s);
const app=$("#app");

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const isValidUrl=s=>{
 try{
  const u=new URL(s);
  return ["http:","https:"].includes(u.protocol);
 }catch{return false}
};

function toast(msg){
 const t=$("#toast");
 if(!t)return;
 t.textContent=msg;
 t.classList.add("show");
 setTimeout(()=>t.classList.remove("show"),5000);
}

function navigate(hash){
 location.hash=hash;
}

function activeTasks(){
 const c=state.settings.community;
 if(state.settings.features?.tasksEnabled===false)return [];
 return [
  {id:"youtube",title:"Subscribe to Winjo Gamerz",desc:"Visit our YouTube channel.",url:c.youtube,icon:"▶"},
  {id:"like",title:"Like the selected video",desc:"Open the selected YouTube video.",url:c.like,icon:"♥"},
  {id:"comment",title:"Comment on the selected video",desc:"Leave a comment on the selected video.",url:c.comment,icon:"✎"},
  {id:"discord",title:"Join our Discord server",desc:"Meet the GAMEVERSE community.",url:c.discord,icon:"◈"}
 ].filter(t=>c.enabled?.[t.id]!==false && isValidUrl(t.url));
}

function loadLocal(){
 try{
  const g=JSON.parse(localStorage.getItem("gv_games")||"null");
  if(g)state.games=g;
  const s=JSON.parse(localStorage.getItem("gv_settings")||"null");
  if(s)state.settings=mergeSettings(s);
 }catch{}
}

function saveLocal(){
 localStorage.setItem("gv_games",JSON.stringify(state.games));
 localStorage.setItem("gv_settings",JSON.stringify(state.settings));
}

async function initFirebase(){
 if(!FIREBASE_CONFIGURED)return;

 try{
  const [appMod,authMod,dbMod]=await Promise.all([
   import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
   import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
   import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js")
  ]);

  const fbApp=appMod.initializeApp(firebaseConfig);
  const auth=authMod.getAuth(fbApp);
  const db=dbMod.getFirestore(fbApp);

  // GAMEVERSE uses Firestore and hosted image URLs.
  // Firebase Storage is not required.
  state.fb={...authMod,...dbMod,auth,db};

  await loadCloudPublic();
  // Refresh after cloud data arrives, without delaying the initial page render.
  render();

  authMod.onAuthStateChanged(auth,async user=>{
   state.user=user&&user.email?.toLowerCase()===ADMIN_EMAIL&&user.emailVerified?user:null;

   if(user && user.email?.toLowerCase()!==ADMIN_EMAIL){
    await authMod.signOut(auth);
    toast("This account is not authorized for GAMEVERSE administration.");
   }

   if(location.hash==="#admin")render();
  });

 }catch(e){
  console.error(e);
  toast("Firebase could not initialize. Check firebase-config.js.");
 }
}

async function loadCloudPublic(){
 const f=state.fb;
 if(!f)return;

 try{
  const snap=await f.getDoc(f.doc(f.db,"site","public"));

  if(snap.exists()){
   const d=snap.data();

   if(Array.isArray(d.games)&&d.games.length){
    state.games=d.games;
   }

   if(d.settings){
    state.settings=mergeSettings(d.settings);
   }
  }

 }catch(e){
  console.warn("Public cloud data unavailable; using starter content.",e);
 }
}

/* ---- Admin permission guard: verified administrator only ---- */
function isAdminUser(u){
 return !!u&&u.email?.toLowerCase()===ADMIN_EMAIL&&u.emailVerified===true;
}

async function assertAdmin(){
 const f=state.fb;
 const u=f?.auth?.currentUser;
 if(!f||!isAdminUser(u)||!isAdminUser(state.user)){
  throw new Error("Only the verified GAMEVERSE administrator can change website images.");
 }
 // Re-check against a fresh token so a revoked/changed account cannot continue.
 const t=await u.getIdTokenResult();
 if(t.claims.email?.toLowerCase()!==ADMIN_EMAIL||t.claims.email_verified!==true){
  throw new Error("Administrator verification failed. Please sign in again.");
 }
}

async function saveCloud(){
 const f=state.fb;
 if(f)await assertAdmin();

 if(!f){
  saveLocal();
  return;
 }

 await f.setDoc(
  f.doc(f.db,"site","public"),
  {
   games:state.games,
   settings:state.settings,
   updatedAt:f.serverTimestamp()
  },
  {merge:true}
 );
}


async function loadGameMetrics(gameId){const el=$("#game-analytics"),base=String(state.settings.features?.statsApiUrl||"").trim();if(!el||!base||state.settings.features?.analyticsEnabled===false)return;try{const r=await fetch(base.replace(/\/$/,"")+"/stats");if(!r.ok)throw Error();const d=await r.json(),g=(d.games||[]).find(x=>x.gameId===gameId);el.textContent=g?`Community activity · ${Number(g.views)||0} game views · ${Number(g.plays)||0} Play Now clicks`:`Community activity · No tracked views yet.`}catch{el.textContent="Game statistics temporarily unavailable."}}
async function trackMetric(type,gameId=""){
 const url=String(state.settings.features?.statsApiUrl||"").trim();
 if(!url||state.settings.features?.analyticsEnabled===false)return;
 try{await fetch(url.replace(/\/$/,"")+"/event",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type,gameId,visitorId:getVisitorId()}),keepalive:true});}catch(e){console.warn("Analytics event not recorded",e)}
}
function getVisitorId(){let id=localStorage.getItem("gv_visitor_id");if(!id){id=crypto.randomUUID();localStorage.setItem("gv_visitor_id",id)}return id}
async function loadFooterStats(){const el=$("#gv-footer-stats"),url=String(state.settings.features?.statsApiUrl||"").trim();if(!el||!url||state.settings.features?.analyticsEnabled===false)return;try{const r=await fetch(url.replace(/\/$/,"")+"/stats");if(!r.ok)throw Error("Stats unavailable");const d=await r.json();el.textContent=` · Visitors: ${Number(d.totalVisitors)||0} · Today: ${Number(d.todayVisitors)||0} · Online: ${Number(d.onlineNow)||0}`;}catch{el.textContent=" · Live statistics temporarily unavailable"}}
async function wireCommunityFeedback(game){
 const f=state.fb;if(!f)return;
 try{
  if(state.settings.features?.ratingsEnabled!==false){const snap=await f.getDocs(f.collection(f.db,"ratings"));const rows=snap.docs.map(x=>x.data()).filter(x=>x.gameId===game.id);const avg=rows.length?rows.reduce((a,x)=>a+Number(x.stars||0),0)/rows.length:0;const el=$("#rating-summary");if(el)el.textContent=rows.length?`${avg.toFixed(1)} / 5 from ${rows.length} rating(s)`:"No ratings yet — be the first!";}
 }catch(e){console.warn("Could not load ratings",e)}
 $("#rating-form")?.addEventListener("submit",async e=>{e.preventDefault();try{const stars=Number(new FormData(e.currentTarget).get("stars"));if(!f||stars<1||stars>5)throw Error("Connect Firebase and choose a rating.");await f.addDoc(f.collection(f.db,"ratings"),{gameId:game.id,stars,createdAt:f.serverTimestamp()});toast("Thanks for rating this game!");wireCommunityFeedback(game)}catch(err){toast(err.message||"Rating could not be saved.")}});
 $("#feedback-form")?.addEventListener("submit",async e=>{e.preventDefault();try{if(!f)throw Error("Feedback needs Firebase connection.");const message=String(new FormData(e.currentTarget).get("message")||"").trim();if(message.length<4)throw Error("Please enter a little more detail.");await f.addDoc(f.collection(f.db,"feedback"),{gameId:game.id,message:message.slice(0,1000),createdAt:f.serverTimestamp()});e.currentTarget.reset();$("#feedback-status").textContent="Thanks! Your feedback was submitted.";}catch(err){toast(err.message||"Feedback could not be sent.")}});
}

function footer(){
 return `<footer class="footer"><div class="container footer-inner"><div>© ${new Date().getFullYear()} GAMEVERSE. Independent gaming directory. <span class="gv-live-stats" id="gv-footer-stats">Visitor statistics unavailable until the analytics Worker is configured.</span></div><div class="footer-links"><a href="#home">Home</a><a href="#games">Games</a><a href="#downloads">Downloads</a><a href="#contact">Contact</a><a href="#privacy">Privacy</a><a href="#terms">Terms</a></div></div></footer>`;
}

function header(){
 return `<header class="topbar"><a class="logo" href="#home"><span class="logo-icon">G</span> GAMEVERSE</a><nav class="nav"><a href="#home">HOME</a><a href="#games">GAMES</a><a href="#downloads">DOWNLOADS</a><a href="#contact">CONTACT</a></nav><div class="actions"><a class="btn btn-primary btn-small" href="#games">EXPLORE GAMES ↗</a></div></header>`;
}

const PH169="https://placehold.co/800x450/151b26/ffffff?text=GAMEVERSE";

/* Cover (+ optional logo overlay). Uses the saved crop settings when present. */
function coverInner(g,frame=FRAME.cover){
 const fit=fitMarkup(specFor(g.cover,g.coverFit),frame,`${g.title||""} cover`);
 const img=fit||`<img class="gv-img-plain" src="${esc(g.cover||"")}" alt="${esc(g.title)} cover" loading="lazy" onerror="this.src='${PH169}'">`;
 const lspec=g.logo?specFor(g.logo,g.logoFit):null;
 const logo=lspec?logoMarkup(lspec,frame,`${g.title||""} logo`):(g.logo?plainLogoMarkup(g.logo,`${g.title||""} logo`):"");
 return img+logo;
}

function thumbHTML(g){
 const fit=fitMarkup(specFor(g.cover,g.coverFit),FRAME.cover,"");
 return `<div class="gv-thumb">${fit||`<img class="gv-img-plain" src="${esc(g.cover||"")}" alt="" onerror="this.src='${PH169}'">`}</div>`;
}

function screenshotHTML(g){
 if(!g.screenshots?.length)return "";
 return `<div class="screenshots">${g.screenshots.map((u,i)=>{
  const fit=fitMarkup(specFor(u,g.screenshotFit?.[i]),FRAME.screenshot,"Screenshot");
  return `<div class="gv-shot">${fit||`<img class="gv-img-plain" src="${esc(u)}" alt="Screenshot" loading="lazy">`}</div>`;
 }).join("")}</div>`;
}

function detailHTML(g){
 return `<a class="btn btn-ghost btn-small" href="#games">← BACK TO LIBRARY</a><div class="game-detail" style="margin-top:28px"><div><div class="detail-image">${coverInner(g)}</div>${screenshotHTML(g)}</div><div class="detail-copy"><div class="eyebrow">${esc(g.category||"GAME")}</div><h1>${esc(g.title)}</h1><p>${esc(g.description||g.shortDescription||"")}</p><p class="muted-note" style="text-align:left">This game is hosted by an external website. Availability, compatibility and terms are controlled by that provider.</p>${isValidUrl(g.url)?`<a class="btn btn-primary" id="play-game-btn" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">PLAY NOW ↗</a>`:'<button class="btn" disabled>COMING SOON</button>'}</div></div>
 <p id="game-analytics" class="muted-note">Game statistics are unavailable until analytics is configured.</p>
 ${state.settings.features?.ratingsEnabled!==false?`<section class="panel gv-rating-panel"><h2>RATE THIS GAME</h2><p class="section-sub">Share your rating with the GAMEVERSE community.</p><form id="rating-form"><select class="field" name="stars" required><option value="">Choose stars</option>${[5,4,3,2,1].map(n=>`<option value="${n}">${'★'.repeat(n)} (${n}/5)</option>`).join('')}</select><button class="btn btn-primary" style="margin-top:10px">SUBMIT RATING</button></form><p id="rating-summary" class="muted-note">Ratings load when connected to Firebase.</p></section>`:''}
 ${state.settings.features?.feedbackEnabled!==false?`<section class="panel gv-rating-panel"><h2>GAME FEEDBACK</h2><form id="feedback-form" class="form-grid"><div class="form-row full"><label>Your feedback</label><textarea class="field" name="message" maxlength="1000" required placeholder="What did you think about this game?"></textarea></div><div class="form-row full"><button class="btn">SEND FEEDBACK</button></div></form><div id="feedback-status" class="muted-note">Please keep feedback respectful. Do not share personal information.</div></section>`:''}`;
}

function heroHTML(h){
 const spec=h.heroImage?specFor(h.heroImage,h.heroFit):null;
 const bg=h.heroImage&&isRenderableUrl(h.heroImage)
  ?`<div class="gv-hero-bg">${spec?fitMarkup(spec,FRAME.heroDesktop,""):focalMarkup(h.heroImage,{x:50,y:50},1,"")}</div><div class="hero-shade"></div>`:"";
 return `<section class="hero ${bg?"hero-custom":""}">${bg}<div class="hero-content"><div class="eyebrow">WELCOME TO GAMEVERSE</div><h1>${esc(h.heading).replace("GAMING WORLD.",'<span>GAMING WORLD.</span>')}</h1><p>${esc(h.subtitle)}</p><div class="hero-buttons"><a class="btn btn-primary" href="#games">EXPLORE GAMES ↗</a><a class="btn btn-ghost" href="#contact">JOIN COMMUNITY</a></div></div></section>`;
}

function gameCard(g){
 return `<article class="game-card"><a href="#game/${encodeURIComponent(g.id)}"><div class="game-cover">${coverInner(g)}${g.featured?'<span class="tag">FEATURED</span>':""}</div><div class="game-info"><h3>${esc(g.title)}</h3><p>${esc(g.shortDescription||"Explore this game on GAMEVERSE.")}</p><div class="game-meta"><small>${esc(g.category||"Game")}</small><span class="btn btn-small">VIEW GAME ↗</span></div></div></a></article>`;
}

function renderUnlock(){
 const tasks=activeTasks();
 const done=JSON.parse(localStorage.getItem("gv_task_done")||"[]");

 app.innerHTML=`<section class="unlock-wrap"><div class="unlock-card"><div class="unlock-brand"><div class="logo"><span class="logo-icon">G</span> GAMEVERSE</div><h1>UNLOCK YOUR <span style="color:var(--red)">WORLD.</span></h1><p>Complete our community missions to enter GAMEVERSE.<br>Thanks for supporting the community.</p></div>
 ${tasks.length?`<div class="task-list">${tasks.map(t=>`<div class="task"><div class="task-icon">${t.icon}</div><div class="task-copy"><strong>${esc(t.title)}</strong><small>${esc(t.desc)}</small></div><a class="btn btn-small" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">OPEN ↗</a><input class="task-check" type="checkbox" data-task="${t.id}" aria-label="Confirm ${esc(t.title)}" ${done.includes(t.id)?"checked":""}></div>`).join("")}</div>`:`<div class="empty">No community tasks are currently enabled. You can enter GAMEVERSE.</div>`}
 <div class="unlock-footer"><div class="progress"><span id="task-progress"></span></div><small id="task-count" class="muted-note"></small><button class="btn btn-primary" id="unlock-btn">UNLOCK GAMEVERSE →</button><p class="muted-note">Task checkboxes are self-confirmations, not independent verification of subscriptions, likes, comments or server membership. Your unlock is saved in this browser.</p></div></div></section>`;

 function update(){
  const checked=[...document.querySelectorAll("[data-task]:checked")].map(x=>x.dataset.task);
  localStorage.setItem("gv_task_done",JSON.stringify(checked));
  const pct=tasks.length?checked.length/tasks.length*100:100;
  $("#task-progress").style.width=pct+"%";
  $("#task-count").textContent=`${checked.length} OF ${tasks.length} TASKS CONFIRMED`;
 }

 document.querySelectorAll("[data-task]").forEach(x=>x.addEventListener("change",update));
 update();

 $("#unlock-btn").onclick=()=>{
  const checked=[...document.querySelectorAll("[data-task]:checked")];

  if(checked.length!==tasks.length){
   toast("Please confirm all visible tasks first.");
   return;
  }

  localStorage.setItem("gv_unlocked","yes");
  localStorage.setItem("gv_unlock_expires",String(Date.now()+(Number(state.settings.features?.taskIntervalHours)||24)*3600000));
  localStorage.removeItem("gv_task_done");
  navigate("#home");
 };
}

/* =====================================================================
   ADVERTISING: Google AdSense + direct sponsored campaigns
   Only approved, configured AdSense units are rendered. Direct campaigns
   use images already uploaded to the admin media library.
   ===================================================================== */
function activeDirectCampaigns(placement){
 const a=state.settings.ads||{};
 if(!a.enabled||!a.directEnabled)return [];
 const now=Date.now();
 return (a.directCampaigns||[]).filter(c=>{
  if(!c.enabled||c.placement!==placement||!isValidUrl(c.url)||!c.imageSrc)return false;
  const start=c.startAt?new Date(c.startAt+"T00:00:00").getTime():0;
  const end=c.endAt?new Date(c.endAt+"T23:59:59").getTime():Infinity;
  return now>=start&&now<=end;
 }).slice(0,1);
}

function adSenseUnit(placement){
 const a=state.settings.ads||{};
 const g=a.adsense||{};
 const slot=g.slots?.[placement]||"";
 if(!a.enabled||!g.enabled||!g.approved||!/^ca-pub-\d{10,20}$/.test(g.publisherId||"")||!/^\d{5,25}$/.test(String(slot)))return "";
 return `<div class="gv-ad gv-adsense"><small class="gv-ad-label">Advertisement</small><ins class="adsbygoogle" style="display:block;min-height:90px" data-ad-client="${esc(g.publisherId)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins></div>`;
}

function directAdMarkup(placement){
 return activeDirectCampaigns(placement).map(c=>{
  const img=state.settings.mediaLibrary.find(x=>x.id===c.imageId);
  const visual=img?.spec?fitMarkup(img.spec,FRAME.heroDesktop,`${c.sponsor||c.title} sponsored banner`):`<img src="${esc(c.imageSrc)}" alt="${esc(c.sponsor||c.title)} sponsored banner" loading="lazy">`;
  return `<div class="gv-ad gv-direct-ad"><small class="gv-ad-label">Sponsored</small><a href="${esc(c.url)}" target="_blank" rel="sponsored nofollow noopener noreferrer" aria-label="Visit ${esc(c.sponsor||c.title)} sponsored website"><div class="gv-direct-visual">${visual}</div><div class="gv-direct-copy"><strong>${esc(c.title)}</strong>${c.description?`<span>${esc(c.description)}</span>`:""}</div></a></div>`;
 }).join("");
}

function adPlacement(placement){
 const direct=directAdMarkup(placement);
 const google=adSenseUnit(placement);
 return direct||google?`<section class="gv-ad-placement container" aria-label="Advertisements">${direct}${google}</section>`:"";
}

function mountAdSense(){
 const units=[...document.querySelectorAll("ins.adsbygoogle:not([data-gv-pushed])")];
 if(!units.length)return;
 const publisher=units[0].dataset.adClient;
 if(!document.querySelector(`script[data-gv-adsense="${publisher}"]`)){
  const script=document.createElement("script");
  script.async=true;
  script.crossOrigin="anonymous";
  script.dataset.gvAdsense=publisher;
  script.src=`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisher)}`;
  document.head.appendChild(script);
 }
 window.adsbygoogle=window.adsbygoogle||[];
 units.forEach(unit=>{
  unit.dataset.gvPushed="1";
  try{window.adsbygoogle.push({})}catch(err){console.warn("AdSense unit could not be queued:",err)}
 });
}

function renderHome(){
 const featured=state.games.filter(g=>g.published&&g.featured).slice(0,3);
 const recent=state.games.filter(g=>g.published).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,3);
 const h=state.settings.homepage;

 app.innerHTML=`${header()}<main>${heroHTML(h)}${adPlacement("homeTop")}
 <section class="section container"><div class="section-head"><div><div class="eyebrow">HANDPICKED FOR YOU</div><h2>FEATURED GAMES</h2><div class="section-sub">Start your next adventure.</div></div><a class="btn btn-ghost" href="#games">VIEW ALL GAMES ↗</a></div><div class="game-grid">${featured.length?featured.map(gameCard).join(""):'<div class="empty">No featured games yet.</div>'}</div></section>
 <section class="section container" style="padding-top:0"><div class="section-head"><div><div class="eyebrow">FRESH DROPS</div><h2>RECENTLY ADDED</h2></div></div><div class="game-grid">${recent.length?recent.map(gameCard).join(""):'<div class="empty">Games will appear here when published.</div>'}</div></section>${adPlacement("homeBottom")}
 <section class="section container"><div class="panel" style="display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap"><div><div class="eyebrow">JOIN THE COMMUNITY</div><h2 style="font:800 34px 'Barlow Condensed';margin:8px 0">${esc(h.communityText)}</h2><p class="section-sub">Follow Winjo Gamerz and connect with other players.</p></div><a class="btn btn-primary" href="${esc(state.settings.contact.discord)}" target="_blank" rel="noopener">JOIN DISCORD ↗</a></div></section></main>${footer()}`;
 mountAdSense();
}

function renderGames(){
 const games=state.games.filter(g=>g.published);

 app.innerHTML=`${header()}<main class="page-shell container"><div class="page-head"><div class="eyebrow">THE COLLECTION</div><h1 class="page-title">GAME LIBRARY</h1><p>Explore the collection and find your next game.</p></div>${adPlacement("gamesTop")}<div class="toolbar"><input id="game-search" class="field search" placeholder="Search games..."><select id="category-filter" class="field" style="max-width:190px"><option value="">All categories</option>${[...new Set(games.map(g=>g.category||"Other"))].map(c=>`<option>${esc(c)}</option>`).join("")}</select></div><div class="game-grid" id="library-grid">${games.map(gameCard).join("")||'<div class="empty">No published games yet.</div>'}</div>${adPlacement("gamesBottom")}</main>${footer()}`;
 mountAdSense();

 const filter=()=>{
  const q=$("#game-search").value.toLowerCase();
  const c=$("#category-filter").value;
  const found=games.filter(g=>(g.title+" "+g.shortDescription).toLowerCase().includes(q)&&(!c||g.category===c));
  $("#library-grid").innerHTML=found.map(gameCard).join("")||'<div class="empty">No games match your search.</div>';
 };

 $("#game-search").addEventListener("input",filter);
 $("#category-filter").addEventListener("change",filter);
}

function renderGame(id){
 const g=state.games.find(x=>x.id===id&&x.published);

 if(!g){
  navigate("#games");
  return;
 }

 app.innerHTML=`${header()}<main class="page-shell container">${adPlacement("gameTop")}${detailHTML(g)}${adPlacement("gameBottom")}</main>${footer()}`;
 mountAdSense();
 trackMetric("view",g.id);
 $("#play-game-btn")?.addEventListener("click",()=>trackMetric("play",g.id));
 wireCommunityFeedback(g);
 loadGameMetrics(g.id);
}

function renderDownloads(){
 const cfg=state.settings.downloads||DEFAULT_SETTINGS.downloads;
 const items=(cfg.items||[]).filter(x=>x.published);
 app.innerHTML=`${header()}<main class="page-shell container"><div class="page-head"><div class="eyebrow">GAMEVERSE FILE CENTER</div><h1 class="page-title">FREE GAME DOWNLOADS</h1><p>Download files published by the GAMEVERSE administrator. Check system requirements and scan files before opening them.</p></div>${cfg.enabled?`<div class="download-grid">${items.map(x=>`<article class="download-card"><div class="download-art">${x.image?`<img src="${esc(x.image)}" alt="${esc(x.title)}" loading="lazy">`:'<span>⬇</span>'}</div><div class="download-info"><div class="download-meta"><span class="download-type">${esc((x.fileType||'FILE').toUpperCase())}</span><span class="download-free">FREE</span></div><h2>${esc(x.title)}</h2><p>${esc(x.description||'No description provided.')}</p>${`<a class="btn btn-primary" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" download>DOWNLOAD ↧</a>`}</div></article>`).join('')||'<div class="empty">No downloads have been published yet. Check back soon!</div>'}</div>`:'<div class="empty">Downloads are temporarily unavailable.</div>'}<p class="muted-note" style="text-align:left;margin-top:24px">Only download games and files you are authorized to distribute. GAMEVERSE does not guarantee third-party files; scan downloads with trusted security software before running them.</p></main>${footer()}`;
}

function renderContact(){
 const c=state.settings.contact;

 app.innerHTML=`${header()}<main class="page-shell container"><div class="page-head"><div class="eyebrow">WE'RE HERE TO HELP</div><h1 class="page-title">${esc(c.heading)}</h1><p>${esc(c.description)}</p></div><div class="contact-grid"><div class="contact-card"><div class="task-icon">◈</div><h3>DISCORD SUPPORT</h3><p>Join our Discord community for game issues, broken links, suggestions and new game requests.</p><a class="btn btn-primary" href="${esc(c.discord)}" target="_blank" rel="noopener">JOIN OUR DISCORD ↗</a></div><div class="contact-card"><div class="task-icon">▶</div><h3>WINJO GAMERZ</h3><p>Subscribe to our YouTube channel for gaming videos and GAMEVERSE updates.</p><a class="btn" href="${esc(c.youtube)}" target="_blank" rel="noopener">VISIT CHANNEL ↗</a></div></div></main>${footer()}`;
}

function renderPolicy(kind){
 const privacy=kind==="privacy";

 app.innerHTML=`${header()}<main class="page-shell container"><div class="page-head"><div class="eyebrow">GAMEVERSE INFORMATION</div><h1 class="page-title">${privacy?"PRIVACY POLICY":"TERMS OF USE"}</h1></div><div class="panel"><p class="section-sub">${privacy?"GAMEVERSE stores a simple unlock flag and task confirmations in your browser's local storage. If Firebase is configured, public game and website settings may be stored in Firebase. Admin authentication is handled by Firebase Authentication. If Google AdSense is enabled, Google and its advertising partners may use cookies or similar technologies to serve, measure and personalize ads according to your settings and applicable consent requirements. Direct sponsor banners link to third-party websites that have their own privacy practices. Before enabling advertising, publish a complete privacy and cookie notice explaining the providers used, data processing, consent choices and contact details, and configure any consent tools required for your visitors.":"GAMEVERSE is an independent directory that links to third-party game websites. External sites control their own content, availability and terms. GAMEVERSE is not affiliated with or endorsed by Rockstar Games. Only use external content where you have the right to access and share it. Replace this starter text with reviewed terms before public launch."}</p></div></main>${footer()}`;
}

function renderAdmin(){
 if(!state.fb){
  app.innerHTML=`${header()}<main class="container"><div class="login-box"><div class="eyebrow">RESTRICTED AREA</div><h1>ADMIN ACCESS</h1><p>Admin authentication is not active yet. Configure Firebase in <b>firebase-config.js</b>, enable Email/Password Authentication, create the authorized administrator account for <b>${ADMIN_EMAIL}</b>, and deploy the security rules included in this project.</p><a class="btn btn-primary" href="#home">BACK TO WEBSITE</a></div></main>${footer()}`;
  return;
 }

 if(!state.user){
  app.innerHTML=`${header()}<main class="container"><div class="login-box"><div class="eyebrow">AUTHORIZED ADMINISTRATOR ONLY</div><h1>ADMIN LOGIN</h1><p>Sign in using the authorized email address. Access is restricted to ${ADMIN_EMAIL}.</p><form id="admin-login"><div class="form-row"><label>ADMIN EMAIL</label><input class="field" type="email" id="admin-email" required autocomplete="username" placeholder="Email address"></div><div class="form-row"><label>PASSWORD</label><input class="field" type="password" id="admin-password" required autocomplete="current-password" placeholder="Password"></div><button class="btn btn-primary" type="submit">SECURE LOGIN →</button><button class="btn btn-ghost" type="button" id="reset-password">SEND PASSWORD RESET</button></form></div></main>${footer()}`;

  $("#admin-login").onsubmit=async e=>{
   e.preventDefault();

   const email=$("#admin-email").value.trim().toLowerCase();

   if(email!==ADMIN_EMAIL){
    toast("This email is not authorized.");
    return;
   }

   try{
    const credential=await state.fb.signInWithEmailAndPassword(
     state.fb.auth,
     email,
     $("#admin-password").value
    );

    if(!credential.user.emailVerified){
     await state.fb.sendEmailVerification(credential.user);
     await state.fb.signOut(state.fb.auth);
     state.user=null;

     toast("Verification email sent. Open the link in your Gmail, then sign in again.");
     renderAdmin();
     return;
    }

    state.user=credential.user;
    render();

   }catch(err){
    console.error("GAMEVERSE admin login failed:",err);
    toast(err.message||"Login failed.");
   }
  };

  $("#reset-password").onclick=async()=>{
   const email=$("#admin-email").value.trim().toLowerCase();

   if(email!==ADMIN_EMAIL){
    toast("Enter the authorized admin email first.");
    return;
   }

   try{
    await state.fb.sendPasswordResetEmail(state.fb.auth,email);
    toast("Password reset email sent.");
   }catch(e){
    toast(e.message);
   }
  };

  return;
 }

 const tab=state.adminTab;

 app.innerHTML=`${header()}<div class="admin-layout"><aside class="admin-side"><h4>CONTROL CENTER</h4><div class="admin-nav">${[["overview","▦ OVERVIEW"],["games","▣ MANAGE GAMES"],["add","＋ ADD NEW GAME"],["downloads","⬇ DOWNLOADS"],["community","◈ COMMUNITY SETTINGS"],["features","⚙ FEATURE CONTROLS"],["feedback","✉ PLAYER FEEDBACK"],["homepage","⌂ HOMEPAGE SETTINGS"],["contact","✉ CONTACT SETTINGS"],["media","▧ IMAGE LIBRARY & HOSTING"],["ads","▤ ADVERTISEMENT SETTINGS"]].map(([id,label])=>`<button data-tab="${id}" class="${tab===id?"active":""}">${label}</button>`).join("")}<button id="admin-logout">↪ LOG OUT</button></div></aside><section class="admin-main"><div class="admin-top"><div><div class="eyebrow">GAMEVERSE CONTROL CENTER</div><h1>${({overview:"OVERVIEW",games:"MANAGE GAMES",add:state.editingId?"EDIT GAME":"ADD NEW GAME",downloads:"DOWNLOAD MANAGER",community:"COMMUNITY SETTINGS",features:"FEATURE CONTROLS",feedback:"PLAYER FEEDBACK",homepage:"HOMEPAGE SETTINGS",contact:"CONTACT SETTINGS",media:"IMAGE LIBRARY & HOSTING",ads:"ADVERTISEMENT SETTINGS"})[tab]}</h1><small style="color:var(--muted)">${esc(state.user.email)}</small></div><a class="btn btn-ghost btn-small" href="#home">VIEW WEBSITE ↗</a></div>${adminContent(tab)}</section></div>${footer()}`;

 document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{
  state.adminTab=b.dataset.tab;
  state.editingId=null;
  renderAdmin();
 });

 $("#admin-logout").onclick=async()=>{
  await state.fb.signOut(state.fb.auth);
  state.user=null;
  navigate("#home");
  toast("Logged out.");
 };

 wireAdmin(tab);
 if(tab==="feedback")loadAdminFeedback();
}

async function loadAdminFeedback(){const el=$("#admin-feedback-list"),f=state.fb;if(!el||!f)return;try{const snap=await f.getDocs(f.collection(f.db,"feedback"));const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));el.innerHTML=rows.length?rows.map(x=>`<div class="admin-game-row"><div class="grow"><strong>${esc(state.games.find(g=>g.id===x.gameId)?.title||x.gameId)}</strong><small>${esc(x.message)} · ${x.createdAt?.toDate?x.createdAt.toDate().toLocaleString():"Date unavailable"}</small></div><button class="btn btn-small" data-feedback-delete="${esc(x.id)}">DELETE</button></div>`).join(""):'<div class="empty">No feedback received yet.</div>';document.querySelectorAll('[data-feedback-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this feedback?'))return;await f.deleteDoc(f.doc(f.db,'feedback',b.dataset.feedbackDelete));loadAdminFeedback()})}catch(e){el.textContent="Could not load feedback. Check Firestore rules and administrator access.";console.warn(e)}}

function adminContent(tab){
 if(tab==="overview")return `<div class="stats"><div class="stat"><span>Total games</span><strong>${state.games.length}</strong></div><div class="stat"><span>Published</span><strong>${state.games.filter(g=>g.published).length}</strong></div><div class="stat"><span>Featured</span><strong>${state.games.filter(g=>g.featured&&g.published).length}</strong></div><div class="stat"><span>Ads status</span><strong style="font-size:22px;color:${state.settings.ads.enabled?"var(--green)":"var(--gold)"}">${state.settings.ads.enabled?"ON":"OFF"}</strong></div></div><div class="panel"><h3>QUICK ACTIONS</h3><button class="btn btn-primary" data-quick="add">＋ ADD A GAME</button> <button class="btn" data-quick="games">MANAGE LIBRARY</button></div><div class="panel"><h3>RECENT GAMES</h3>${state.games.slice(0,5).map(g=>`<div class="admin-game-row">${thumbHTML(g)}<div class="grow"><strong>${esc(g.title)}</strong><small>${g.published?"Published":"Draft"}</small></div></div>`).join("")}</div>`;

 if(tab==="games")return `<div class="panel"><h3>YOUR GAME LIBRARY</h3><div class="row-actions" style="margin-bottom:15px"><button class="btn btn-primary btn-small" data-quick="add">＋ ADD GAME</button><button class="btn btn-small" id="seed-games">RESTORE STARTER GAMES</button></div>${state.games.map(g=>`<div class="admin-game-row">${thumbHTML(g)}<div class="grow"><strong>${esc(g.title)}</strong><small>${g.published?"Published":"Draft"} · ${esc(g.category||"Other")}</small></div><div class="row-actions"><button class="btn btn-small" data-edit="${esc(g.id)}">EDIT</button><button class="btn btn-small" data-delete="${esc(g.id)}">DELETE</button></div></div>`).join("")}</div>`;

 if(tab==="add")return gameForm();

 if(tab==="downloads"){
  const d=state.settings.downloads||DEFAULT_SETTINGS.downloads;
  return `<div class="panel"><h3>DOWNLOAD PAGE SETTINGS</h3><form id="downloads-toggle-form" class="form-grid"><div class="form-row full"><label class="check-row"><input type="checkbox" name="enabled" ${d.enabled?'checked':''}> ENABLE PUBLIC DOWNLOAD PAGE</label></div><div class="form-row full"><button class="btn btn-primary">SAVE DOWNLOAD SETTINGS</button></div></form><p class="muted-note" style="text-align:left">Free downloads only. Paid games and checkout are not included in this release.</p></div><div class="panel"><h3>ADD A DOWNLOAD</h3><form id="download-add-form" class="form-grid"><div class="form-row"><label>Game / file title *</label><input class="field" name="title" maxlength="90" required></div><div class="form-row"><label>File type *</label><select class="field" name="fileType"><option value="APK">Android APK</option><option value="ZIP">PC ZIP</option><option value="EXE">Windows EXE</option><option value="OTHER">Other</option></select></div><div class="form-row full"><label>Description</label><textarea class="field" name="description" maxlength="500"></textarea></div><div class="form-row full"><label>Game file — APK, ZIP or EXE (optional)</label><input class="field" name="downloadFile" type="file" accept=".apk,.zip,.exe,application/zip,application/vnd.android.package-archive,application/vnd.microsoft.portable-executable"><small class="muted-note">Upload requires a Cloudinary unsigned raw-file preset. Or provide a hosted URL below.</small></div><div class="form-row full"><label>Hosted download URL (use if not uploading a file)</label><input class="field" name="url" type="url" placeholder="https://..."></div><div class="form-row full"><label>Cover image — upload JPG, PNG or WebP</label><input class="field" name="imageFile" type="file" accept="image/jpeg,image/png,image/webp"><small class="muted-note">Images upload to your configured Cloudinary account. Configure it under Image Library & Hosting first.</small></div><div class="form-row"><label class="check-row"><input type="checkbox" name="published" checked> Publish immediately</label></div><div class="form-row full"><button class="btn btn-primary">＋ ADD DOWNLOAD</button></div></form></div><div class="panel"><h3>MANAGE DOWNLOADS</h3>${d.items.length?d.items.map(x=>`<div class="admin-game-row"><div class="grow"><strong>${esc(x.title)}</strong><small>${esc(x.fileType)} · Free · ${x.published?'Published':'Draft'}</small></div><div class="row-actions"><button class="btn btn-small" data-download-edit="${esc(x.id)}">EDIT</button><button class="btn btn-small" data-download-toggle="${esc(x.id)}">${x.published?'UNPUBLISH':'PUBLISH'}</button><button class="btn btn-small" data-download-delete="${esc(x.id)}">DELETE</button></div></div>`).join(''):'<div class="empty">No download entries yet.</div>'}</div>`;
 }

 if(tab==="features"){
  const x=state.settings.features||DEFAULT_SETTINGS.features;
  return `<div class="panel"><h3>FEATURE ON / OFF CONTROLS</h3><form id="features-form" class="form-grid">
  ${[["tasksEnabled","Community tasks"],["ratingsEnabled","Game star ratings"],["feedbackEnabled","Player feedback"],["analyticsEnabled","Real visitor / game analytics"],["rewardedAdsEnabled","Rewarded ads (requires approved ad provider integration)"]].map(([k,l])=>`<div class="form-row full"><label class="check-row"><input type="checkbox" name="${k}" ${x[k]?'checked':''}> ${l}</label></div>`).join('')}
  <div class="form-row"><label>Task reset interval (hours)</label><input class="field" name="taskIntervalHours" type="number" min="1" max="720" value="${Number(x.taskIntervalHours)||24}"></div>
  <div class="form-row full"><label>Cloudflare Analytics Worker URL</label><input class="field" name="statsApiUrl" type="url" value="${esc(x.statsApiUrl||'')}" placeholder="https://your-worker.workers.dev"><small class="muted-note">Required for shared visitor counts, online count, game views and play counts. Deploy the included analytics-worker folder and paste its URL here.</small></div>
  <div class="form-row full"><button class="btn btn-primary">SAVE FEATURE SETTINGS</button></div></form></div>
  <div class="panel"><h3>REWARDED ADS STATUS</h3><p class="section-sub">The switch above is a feature gate only. Genuine rewarded-ad completion and one-hour access cannot be enabled until an ad network account, rewarded placement and server-side verification callback are configured. GAMEVERSE will not fake ad views or unlock access from a simple button click.</p><span class="status-pill warn">${x.rewardedAdsEnabled?'Waiting for provider verification setup':'Disabled'}</span></div>`;
 }

 if(tab==="feedback")return `<div class="panel"><h3>PLAYER FEEDBACK</h3><p class="section-sub">Feedback submitted by visitors is stored in Firestore. Only the verified administrator can read or delete it.</p><div id="admin-feedback-list" class="empty">Loading feedback…</div></div>`;

 if(tab==="community"){
  const c=state.settings.community;
  return `<div class="panel"><h3>UNLOCK SCREEN TASKS</h3><p class="section-sub">Leave a URL empty or disable a task to hide it from visitors.</p><form id="community-form" class="form-grid">${[["youtube","YouTube channel URL"],["like","Like video URL"],["comment","Comment video URL"],["discord","Discord invite URL"]].map(([k,l])=>`<div class="form-row"><label>${l}</label><input class="field" name="${k}" type="url" value="${esc(c[k]||"")}" placeholder="https://..."><label class="check-row"><input type="checkbox" name="enabled_${k}" ${c.enabled?.[k]!==false?"checked":""}> Show this task when a valid link is present</label></div>`).join("")}<div class="form-row"><label>Reset task progress after (hours)</label><input class="field" name="taskIntervalHours" type="number" min="1" max="720" value="${Number(state.settings.features?.taskIntervalHours)||24}"></div><div class="form-row full"><button class="btn btn-primary">SAVE COMMUNITY SETTINGS</button></div></form></div>`;
 }

 if(tab==="homepage"){
  const h=state.settings.homepage;
  return `<div class="panel"><h3>HOMEPAGE CONTENT</h3><form id="homepage-form" class="form-grid"><div class="form-row full"><label>Hero heading</label><input class="field" name="heading" value="${esc(h.heading)}"></div><div class="form-row full"><label>Hero subtitle</label><textarea class="field" name="subtitle">${esc(h.subtitle)}</textarea></div><div class="form-row full"><label>Hero background image</label><div data-imgfield="hero"></div></div><div class="form-row full"><label>Community section text</label><input class="field" name="communityText" value="${esc(h.communityText)}"></div><div class="form-row full"><button class="btn btn-primary">SAVE HOMEPAGE SETTINGS</button></div></form></div>`;
 }

 if(tab==="contact"){
  const c=state.settings.contact;
  return `<div class="panel"><h3>CONTACT PAGE</h3><form id="contact-form" class="form-grid"><div class="form-row"><label>Discord URL</label><input class="field" name="discord" type="url" value="${esc(c.discord)}"></div><div class="form-row"><label>YouTube URL</label><input class="field" name="youtube" type="url" value="${esc(c.youtube)}"></div><div class="form-row full"><label>Heading</label><input class="field" name="heading" value="${esc(c.heading)}"></div><div class="form-row full"><label>Description</label><textarea class="field" name="description">${esc(c.description)}</textarea></div><div class="form-row full"><button class="btn btn-primary">SAVE CONTACT SETTINGS</button></div></form></div>`;
 }

 if(tab==="media")return mediaTab();

 if(tab==="ads"){
  const a=state.settings.ads||DEFAULT_SETTINGS.ads;
  const g=a.adsense||DEFAULT_SETTINGS.ads.adsense;
  const slots=g.slots||{};
  const campaigns=a.directCampaigns||[];
  const placementLabels={homeTop:"Homepage — below hero",homeBottom:"Homepage — before community section",gamesTop:"Game library — above games",gamesBottom:"Game library — below games",gameTop:"Game page — above details",gameBottom:"Game page — below details"};
  const media=state.settings.mediaLibrary||[];
  return `<div class="panel"><h3>ADVERTISING STATUS</h3><p class="section-sub">Ads stay disabled until you turn them on. Google ads only load after you confirm that Google has approved your site. Direct sponsor banners are labelled Sponsored.</p><form id="ads-master-form" class="form-grid"><div class="form-row full"><label class="check-row"><input type="checkbox" name="enabled" ${a.enabled?"checked":""}> ENABLE ALL ADVERTISING</label></div><div class="form-row full"><button class="btn btn-primary">SAVE ADVERTISING STATUS</button></div></form></div>
  <div class="panel"><h3>GOOGLE ADSENSE</h3><p class="section-sub">Use your AdSense publisher ID and the ad slot IDs generated inside your AdSense account. Do not paste arbitrary script code here.</p><form id="adsense-form" class="form-grid"><div class="form-row full"><label class="check-row"><input type="checkbox" name="approved" ${g.approved?"checked":""}> My website has been approved by Google AdSense</label><label class="check-row"><input type="checkbox" name="enabled" ${g.enabled?"checked":""}> ENABLE GOOGLE ADSENSE</label></div><div class="form-row full"><label>Publisher ID</label><input class="field" name="publisherId" value="${esc(g.publisherId||"")}" placeholder="ca-pub-1234567890123456"></div>${Object.entries(placementLabels).map(([k,label])=>`<div class="form-row"><label>${label} — Ad slot ID</label><input class="field" name="slot_${k}" inputmode="numeric" value="${esc(slots[k]||"")}" placeholder="Example: 1234567890"></div>`).join("")}<div class="form-row full"><button class="btn btn-primary">SAVE GOOGLE ADSENSE SETTINGS</button></div></form><p class="muted-note" style="text-align:left">Google reviews your site before ads can serve. Keep this disabled until approval. AdSense units are not shown on the unlock screen or inside game controls.</p></div>
  <div class="panel"><h3>DIRECT SPONSORED ADVERTISEMENTS</h3><p class="section-sub">Create campaigns for brands or game developers who pay you directly. Upload the banner first in Image Library & Hosting, then select it below.</p><form id="direct-master-form" class="form-grid"><div class="form-row full"><label class="check-row"><input type="checkbox" name="enabled" ${a.directEnabled?"checked":""}> ENABLE DIRECT SPONSOR CAMPAIGNS</label></div><div class="form-row full"><button class="btn btn-primary">SAVE DIRECT AD SETTINGS</button></div></form><form id="direct-ad-form" class="form-grid"><div class="form-row"><label>Campaign title *</label><input class="field" name="title" required maxlength="70" placeholder="Example: New indie game launch"></div><div class="form-row"><label>Sponsor / brand name *</label><input class="field" name="sponsor" required maxlength="70" placeholder="Brand name"></div><div class="form-row full"><label>Destination website *</label><input class="field" name="url" type="url" required placeholder="https://sponsor.example"></div><div class="form-row full"><label>Banner image from your Image Library *</label><select class="field" name="imageId" required><option value="">Choose an uploaded banner</option>${media.map(m=>`<option value="${esc(m.id)}">${esc(m.label||"Untitled image")}</option>`).join("")}</select>${media.length?"":'<small class="muted-note">No images yet. Upload a sponsor banner in Image Library & Hosting first.</small>'}</div><div class="form-row full"><label>Short description (optional)</label><input class="field" name="description" maxlength="120" placeholder="A short, honest sponsor message"></div><div class="form-row"><label>Placement</label><select class="field" name="placement">${Object.entries(placementLabels).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></div><div class="form-row"><label>Start date (optional)</label><input class="field" name="startAt" type="date"></div><div class="form-row"><label>End date (optional)</label><input class="field" name="endAt" type="date"></div><div class="form-row full"><label class="check-row"><input type="checkbox" name="campaignEnabled" checked> Publish this campaign after saving</label></div><div class="form-row full"><button class="btn btn-primary">＋ ADD SPONSORED CAMPAIGN</button></div></form>
  <h3 style="margin-top:24px">YOUR SPONSORED CAMPAIGNS</h3>${campaigns.length?campaigns.map(c=>`<div class="admin-game-row"><div class="gv-thumb"><img src="${esc(c.imageSrc||"")}" alt="" loading="lazy"></div><div class="grow"><strong>${esc(c.title)}</strong><small>${esc(c.sponsor)} · ${esc(placementLabels[c.placement]||c.placement)} · ${c.enabled?"Enabled":"Paused"}</small></div><div class="row-actions"><button class="btn btn-small" data-campaign-toggle="${esc(c.id)}">${c.enabled?"PAUSE":"ENABLE"}</button><button class="btn btn-small" data-campaign-delete="${esc(c.id)}">DELETE</button></div></div>`).join(""):'<div class="empty">No sponsored campaigns yet.</div>'}</div>`;
 }

 return "";
}

function gameForm(){
 const g=state.games.find(x=>x.id===state.editingId)||{title:"",shortDescription:"",description:"",category:"Action",url:"",cover:"",logo:"",screenshots:[],featured:false,published:false};

 return `<div class="panel"><h3>${state.editingId?"EDIT GAME":"GAME DETAILS"}</h3><form id="game-form" class="form-grid"><div class="form-row"><label>Game title *</label><input class="field" name="title" required value="${esc(g.title)}"></div><div class="form-row"><label>Category</label><input class="field" name="category" value="${esc(g.category)}"></div><div class="form-row full"><label>Short description</label><input class="field" name="shortDescription" value="${esc(g.shortDescription)}"></div><div class="form-row full"><label>Full description</label><textarea class="field" name="description">${esc(g.description)}</textarea></div><div class="form-row full"><label>Game URL</label><input class="field" name="url" type="url" value="${esc(g.url)}" placeholder="https://..."></div><div class="form-row full"><label>Main cover image — landscape 16:9</label><div data-imgfield="cover"></div></div><div class="form-row full"><label>Game logo (optional) — transparent PNG/WebP supported</label><div data-imgfield="logo"></div></div><div class="form-row full"><label>Screenshots — each one is cropped individually</label><div data-imggallery></div></div><div class="form-row"><label class="check-row"><input type="checkbox" name="featured" ${g.featured?"checked":""}> Featured game</label><label class="check-row"><input type="checkbox" name="published" ${g.published?"checked":""}> Publish game</label></div><div class="form-row full"><small class="muted-note" style="text-align:left">Choose an image from your computer, select the visible crop area, and save. Crop settings are saved with the game.</small></div><div class="form-row full"><div class="row-actions"><button class="btn btn-primary">SAVE GAME</button><button class="btn" type="button" id="cancel-edit">CANCEL</button></div></div></form></div>`;
}

async function uploadDownloadFile(file,host){
 if(!hostReady(host))throw new Error("Configure Cloudinary first in Image Library & Hosting.");
 const allowed=/\.(apk|zip|exe)$/i.test(file.name);
 if(!allowed)throw new Error("Only APK, ZIP and EXE files are allowed.");
 if(file.size>100*1024*1024)throw new Error("File is larger than 100 MB. Use a trusted external file host for larger files.");
 const fd=new FormData();fd.append("file",file);fd.append("upload_preset",host.uploadPreset);if(host.folder)fd.append("folder",host.folder+"/downloads");
 const response=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(host.cloudName)}/raw/upload`,{method:"POST",body:fd});
 const data=await response.json();if(!response.ok||!isValidUrl(data.secure_url))throw new Error(data.error?.message||"Download file upload failed.");return data.secure_url;
}

function wireAdmin(tab){
 wireImages(tab);
 document.querySelectorAll("[data-quick]").forEach(b=>b.onclick=()=>{
  state.adminTab=b.dataset.quick;
  state.editingId=null;
  renderAdmin();
 });

 document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{
  state.editingId=b.dataset.edit;
  state.adminTab="add";
  renderAdmin();
 });

 document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{
  if(!confirm("Delete this game permanently?"))return;
  state.games=state.games.filter(g=>g.id!==b.dataset.delete);
  await persist();
  renderAdmin();
  toast("Game deleted.");
 });

 $("#seed-games")?.addEventListener("click",async()=>{
  if(!confirm("Restore the original starter game list? Existing games with matching IDs will be replaced."))return;
  const map=new Map(state.games.map(g=>[g.id,g]));
  STARTER_GAMES.forEach(g=>map.set(g.id,{...g}));
  state.games=[...map.values()];
  await persist();
  renderAdmin();
  toast("Starter games restored.");
 });

 $("#cancel-edit")?.addEventListener("click",()=>{
  state.editingId=null;
  state.adminTab="games";
  renderAdmin();
 });

 $("#game-form")?.addEventListener("submit",async e=>{
  e.preventDefault();

  const f=e.currentTarget;
  const d=new FormData(f);
  const title=d.get("title").trim();
  const url=d.get("url").trim();
  const cover=(imgDraft.cover?.src||"").trim();
  const logoSrc=(imgDraft.logo?.src||"").trim();
  const shots=imgDraft.screenshots.filter(x=>isValidUrl(x.src));

  if(url&&!isValidUrl(url)){
   toast("Enter a valid HTTP or HTTPS game URL.");
   return;
  }


  let id=state.editingId||("game-"+crypto.randomUUID());

  let game={
   id,
   title,
   category:d.get("category").trim()||"Other",
   shortDescription:d.get("shortDescription").trim(),
   description:d.get("description").trim(),
   url,
   cover,
   coverFit:specFor(cover,imgDraft.cover?.spec),
   logo:logoSrc,
   logoFit:specFor(logoSrc,imgDraft.logo?.spec),
   screenshots:shots.map(x=>x.src),
   screenshotFit:shots.map(x=>specFor(x.src,x.spec)),
   featured:d.has("featured"),
   published:d.has("published"),
   createdAt:state.games.find(x=>x.id===id)?.createdAt||Date.now()
  };

  if(!game.cover){
   game.cover="https://placehold.co/1000x560/151b26/ffffff?text=GAMEVERSE";
   game.coverFit=null;
  }

  if(state.editingId){
   state.games=state.games.map(x=>x.id===id?game:x);
  }else{
   state.games.unshift(game);
  }

  await persist();
  state.editingId=null;
  state.adminTab="games";
  renderAdmin();
  toast("Game saved successfully.");
 });

 $("#downloads-toggle-form")?.addEventListener("submit",async e=>{
  e.preventDefault(); state.settings.downloads.enabled=new FormData(e.currentTarget).has('enabled'); await persist(); renderAdmin(); toast('Download page settings saved.');
 });
 $("#download-add-form")?.addEventListener("submit",async e=>{
  e.preventDefault(); const form=e.currentTarget; const d=new FormData(form); let url=String(d.get('url')||'').trim();
  const binary=d.get('downloadFile');
  if(binary && binary.size){try{await assertAdmin();toast('Uploading game file...');url=await uploadDownloadFile(binary,state.settings.imageHost);}catch(err){console.error(err);toast(err.message||'Game file upload failed.');return;}}
  if(!isValidUrl(url)){toast('Upload a game file or enter a valid HTTPS download URL.');return;}
  const file=d.get('imageFile'); let image='';
  if(file && file.size){
   if(!file.type.startsWith('image/')){toast('Choose a valid image file.');return;}
   if(!hostReady(state.settings.imageHost)){toast('Configure Cloudinary under Image Library & Hosting before uploading cover images.');return;}
   try{await assertAdmin();toast('Uploading cover image...');const uploaded=await uploadToHost(file,state.settings.imageHost);image=uploaded.url;}
   catch(err){console.error(err);toast(err.message||'Cover image upload failed.');return;}
  }
  const item={id:'download-'+crypto.randomUUID(),title:String(d.get('title')).trim(),fileType:String(d.get('fileType')),description:String(d.get('description')||'').trim(),url,image,paid:false,published:d.has('published'),createdAt:Date.now()};
  state.settings.downloads.items.unshift(item); await persist(); renderAdmin(); toast('Free download added.');
 });
 document.querySelectorAll('[data-download-edit]').forEach(b=>b.onclick=async()=>{const x=state.settings.downloads.items.find(i=>i.id===b.dataset.downloadEdit);if(!x)return;const title=prompt("Download title",x.title);if(title===null)return;const description=prompt("Description",x.description||"");if(description===null)return;const url=prompt("Direct download URL",x.url);if(url===null)return;if(!isValidUrl(url)){toast("Enter a valid HTTP/HTTPS URL.");return}x.title=title.trim().slice(0,90)||x.title;x.description=description.trim().slice(0,500);x.url=url.trim();await persist();renderAdmin();toast("Download updated.")});
 document.querySelectorAll('[data-download-toggle]').forEach(b=>b.onclick=async()=>{const x=state.settings.downloads.items.find(i=>i.id===b.dataset.downloadToggle);if(!x)return;x.published=!x.published;await persist();renderAdmin();toast(x.published?'Download published.':'Download unpublished.');});
 document.querySelectorAll('[data-download-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this download entry?'))return;state.settings.downloads.items=state.settings.downloads.items.filter(i=>i.id!==b.dataset.downloadDelete);await persist();renderAdmin();toast('Download entry deleted.');});

 $("#features-form")?.addEventListener("submit",async e=>{e.preventDefault();const d=new FormData(e.currentTarget);const x=state.settings.features;for(const k of ["tasksEnabled","ratingsEnabled","feedbackEnabled","analyticsEnabled","rewardedAdsEnabled"])x[k]=d.has(k);x.taskIntervalHours=Math.max(1,Math.min(720,Number(d.get("taskIntervalHours"))||24));const u=String(d.get("statsApiUrl")||"").trim();if(u&&!isValidUrl(u)){toast("Enter a valid Worker URL.");return}x.statsApiUrl=u;await persist();renderAdmin();toast("Feature settings saved.")});
 $("#community-form")?.addEventListener("submit",async e=>{
  e.preventDefault();

  const d=new FormData(e.currentTarget);

  state.settings.features.taskIntervalHours=Math.max(1,Math.min(720,Number(d.get("taskIntervalHours"))||24));
  for(const k of ["youtube","like","comment","discord"]){
   const v=d.get(k).trim();

   if(v&&!isValidUrl(v)){
    toast(`Invalid ${k} URL.`);
    return;
   }

   state.settings.community[k]=v;
   state.settings.community.enabled[k]=d.has("enabled_"+k);
  }

  await persist();
  toast("Community settings saved.");
 });

 $("#homepage-form")?.addEventListener("submit",async e=>{
  e.preventDefault();

  const d=new FormData(e.currentTarget);

  state.settings.homepage={
   heading:d.get("heading").trim(),
   subtitle:d.get("subtitle").trim(),
   heroImage:(imgDraft.hero?.src||"").trim(),
   heroFit:specFor((imgDraft.hero?.src||"").trim(),imgDraft.hero?.spec),
   communityText:d.get("communityText").trim()
  };

  await persist();
  toast("Homepage settings saved.");
 });

 $("#contact-form")?.addEventListener("submit",async e=>{
  e.preventDefault();

  const d=new FormData(e.currentTarget);

  for(const k of ["discord","youtube"]){
   if(d.get(k)&&!isValidUrl(d.get(k))){
    toast("Enter valid contact links.");
    return;
   }
  }

  state.settings.contact={
   discord:d.get("discord"),
   youtube:d.get("youtube"),
   heading:d.get("heading"),
   description:d.get("description")
  };

  await persist();
  toast("Contact settings saved.");
 });

 $("#ads-master-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  state.settings.ads.enabled=new FormData(e.currentTarget).has("enabled");
  await persist();renderAdmin();toast("Advertising status saved.");
 });

 $("#adsense-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const d=new FormData(e.currentTarget);
  const publisherId=String(d.get("publisherId")||"").trim();
  if(publisherId&&!/^ca-pub-\d{10,20}$/.test(publisherId)){toast("Publisher ID must look like ca-pub-1234567890123456.");return}
  const slots={};
  for(const key of ["homeTop","homeBottom","gamesTop","gamesBottom","gameTop","gameBottom"]){
   slots[key]=String(d.get("slot_"+key)||"").trim();
   if(slots[key]&&!/^\d{5,25}$/.test(slots[key])){toast("Ad slot IDs must contain numbers only.");return}
  }
  state.settings.ads.adsense={enabled:d.has("enabled"),approved:d.has("approved"),publisherId,slots};
  await persist();renderAdmin();toast("Google AdSense settings saved.");
 });

 $("#direct-master-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  state.settings.ads.directEnabled=new FormData(e.currentTarget).has("enabled");
  await persist();renderAdmin();toast("Direct advertising settings saved.");
 });

 $("#direct-ad-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const d=new FormData(e.currentTarget);
  const title=String(d.get("title")||"").trim();
  const sponsor=String(d.get("sponsor")||"").trim();
  const url=String(d.get("url")||"").trim();
  const imageId=String(d.get("imageId")||"");
  const image=state.settings.mediaLibrary.find(x=>x.id===imageId);
  const startAt=String(d.get("startAt")||"");
  const endAt=String(d.get("endAt")||"");
  if(!title||!sponsor||!isValidUrl(url)||!image){toast("Enter the campaign details, a valid https/http destination and choose an uploaded banner.");return}
  if(startAt&&endAt&&endAt<startAt){toast("Campaign end date must be after its start date.");return}
  state.settings.ads.directCampaigns=state.settings.ads.directCampaigns||[];
  state.settings.ads.directCampaigns.push({id:"sponsor-"+crypto.randomUUID(),title,sponsor,url,imageId,imageSrc:image.src,imageSpec:image.spec||null,description:String(d.get("description")||"").trim(),placement:String(d.get("placement")||"homeTop"),startAt,endAt,enabled:d.has("campaignEnabled"),createdAt:Date.now()});
  await persist();renderAdmin();toast("Sponsored campaign saved.");
 });

 $$('[data-campaign-toggle]').forEach(b=>b.onclick=async()=>{
  const c=(state.settings.ads.directCampaigns||[]).find(x=>x.id===b.dataset.campaignToggle);if(!c)return;c.enabled=!c.enabled;await persist();renderAdmin();toast(c.enabled?"Campaign enabled.":"Campaign paused.");
 });
 $$('[data-campaign-delete]').forEach(b=>b.onclick=async()=>{
  if(!confirm("Delete this sponsored campaign?"))return;
  state.settings.ads.directCampaigns=(state.settings.ads.directCampaigns||[]).filter(x=>x.id!==b.dataset.campaignDelete);await persist();renderAdmin();toast("Campaign deleted.");
 });
}


/* =====================================================================
   IMAGE MANAGEMENT (admin only)
   ===================================================================== */
const imgDraft={cover:null,logo:null,hero:null,screenshots:[]};
const $$=s=>[...document.querySelectorAll(s)];

function draftFromGame(g){
 imgDraft.cover=g.cover?{src:g.cover,spec:specFor(g.cover,g.coverFit)}:null;
 imgDraft.logo=g.logo?{src:g.logo,spec:specFor(g.logo,g.logoFit)}:null;
 imgDraft.screenshots=(g.screenshots||[]).map((u,i)=>({src:u,spec:specFor(u,g.screenshotFit?.[i])}));
}

function fitInfo(item){
 const sp=item?.spec;
 if(!sp)return item?.src?"No crop saved — shown with automatic centre fit.":"";
 const mode={landscape:"Landscape 16:9",custom:"Custom crop",contain:"Contain",trim:"Trimmed",focal:"Focal point",gallery:"Gallery crop",crop:"Crop"}[sp.mode]||sp.mode;
 return `${mode} · zoom ${sp.zoom}× · position ${Math.round(sp.posX)}% / ${Math.round(sp.posY)}%${sp.rotate?` · rotated ${sp.rotate}°`:""}`;
}

function fieldThumb(kind,item){
 if(!item?.src)return `<div class="imgf-thumb imgf-empty" style="aspect-ratio:16/9"><span>No image yet</span></div>`;
 if(kind==="logo"){
  const lg=item.spec?logoMarkup(item.spec,FRAME.cover,"Logo"):plainLogoMarkup(item.src,"Logo");
  return `<div class="imgf-thumb ie-checker" style="aspect-ratio:16/9">${lg}</div>`;
 }
 if(kind==="hero"){
  return `<div class="imgf-thumb" style="aspect-ratio:2.5">${item.spec?fitMarkup(item.spec,FRAME.heroDesktop,""):focalMarkup(item.src)}</div>`;
 }
 return `<div class="imgf-thumb" style="aspect-ratio:16/9">${coverInner({title:"",cover:item.src,coverFit:item.spec})}</div>`;
}

function mountField(kind){
 const box=document.querySelector(`[data-imgfield="${kind}"]`);
 if(!box)return;
 const item=imgDraft[kind];
 box.innerHTML=`<div class="imgf">${fieldThumb(kind,item)}<div class="imgf-body"><div class="row-actions"><button type="button" class="btn btn-primary btn-small" data-imgact="upload">⬆ UPLOAD FROM COMPUTER</button><button type="button" class="btn btn-small" data-imgact="edit" ${item?.src?"":"disabled"}>✂ EDIT / CROP</button><button type="button" class="btn btn-small" data-imgact="remove" ${item?.src?"":"disabled"}>REMOVE</button></div><small class="imgf-info">${esc(fitInfo(item))}</small></div></div>`;
 box.querySelector('[data-imgact="upload"]').onclick=async()=>{
  const files=await pickFiles(false);
  if(!files.length)return;
  const r=await runEditor(kind,null,files[0]);
  if(r){imgDraft[kind]=r;mountField(kind);toast("Image ready. Click save to publish it.")}
 };
 box.querySelector('[data-imgact="edit"]').onclick=async()=>{
  const r=await runEditor(kind,imgDraft[kind]);
  if(r){imgDraft[kind]=r;mountField(kind)}
 };
 box.querySelector('[data-imgact="remove"]').onclick=()=>{
  if(!confirm("Remove this image from the form? (The file stays on your image host.)"))return;
  imgDraft[kind]=null;mountField(kind);
 };
}

function mountGallery(){
 const box=document.querySelector("[data-imggallery]");
 if(!box)return;
 const list=imgDraft.screenshots;
 box.innerHTML=`<div class="imgg">${list.map((it,i)=>`<div class="imgg-item"><div class="imgf-thumb" style="aspect-ratio:16/10"><div class="gv-shot">${fitMarkup(it.spec,FRAME.screenshot,"")||`<img class="gv-img-plain" src="${esc(it.src)}" alt="">`}</div></div><div class="row-actions"><button type="button" class="btn btn-small" data-shot="edit" data-i="${i}" title="Crop">✂</button><button type="button" class="btn btn-small" data-shot="replace" data-i="${i}" title="Replace with a file">⇄</button><button type="button" class="btn btn-small" data-shot="left" data-i="${i}" ${i?"":"disabled"} title="Move earlier" aria-label="Move earlier">◀</button><button type="button" class="btn btn-small" data-shot="right" data-i="${i}" ${i<list.length-1?"":"disabled"} title="Move later" aria-label="Move later">▶</button><button type="button" class="btn btn-small" data-shot="del" data-i="${i}" title="Delete" aria-label="Delete screenshot">✕</button></div></div>`).join("")}</div><div class="row-actions" style="margin-top:12px"><button type="button" class="btn btn-primary btn-small" data-shot="add">＋ ADD SCREENSHOTS FROM COMPUTER</button></div>`;
 box.querySelector('[data-shot="add"]').onclick=async()=>{
  const files=await pickFiles(true);
  for(const f of files){
   const r=await runEditor("screenshot",null,f,imgDraft.screenshots.length);
   if(!r)break;
   imgDraft.screenshots.push(r);mountGallery();
  }
 };
 box.querySelectorAll("[data-i]").forEach(b=>b.onclick=async()=>{
  const i=Number(b.dataset.i),act=b.dataset.shot;
  if(act==="del"){if(confirm("Remove this screenshot?")){imgDraft.screenshots.splice(i,1);mountGallery()}return}
  if(act==="left"||act==="right"){
   const j=act==="left"?i-1:i+1;
   [list[i],list[j]]=[list[j],list[i]];mountGallery();return;
  }
  if(act==="edit"){
   const r=await runEditor("screenshot",list[i],null,i);
   if(r){list[i]=r;mountGallery()}return;
  }
  if(act==="replace"){
   const files=await pickFiles(false);
   if(!files.length)return;
   const r=await runEditor("screenshot",null,files[0],i);
   if(r){list[i]=r;mountGallery()}
  }
 });
}

/* Opens the OS file picker; returns validated image files only. */
function pickFiles(multiple){
 return new Promise(resolve=>{
  const inp=document.createElement("input");
  inp.type="file";inp.accept=ACCEPT;inp.multiple=!!multiple;
  inp.onchange=()=>{
   const ok=[];
   for(const f of inp.files){
    const err=validateFile(f);
    if(err)toast(`${f.name}: ${err}`);else ok.push(f);
   }
   resolve(ok);
  };
  inp.addEventListener("cancel",()=>resolve([]));
  inp.click();
 });
}

function formVal(name){return document.querySelector(`#game-form [name="${name}"]`)}

function makeCtx(kind,index){
 const g0=state.games.find(x=>x.id===state.editingId)||{};
 const game={
  ...g0,
  title:formVal("title")?.value||g0.title||"",
  shortDescription:formVal("shortDescription")?.value||g0.shortDescription||"",
  description:formVal("description")?.value||g0.description||"",
  category:formVal("category")?.value||g0.category||"Action",
  featured:formVal("featured")?.checked??!!g0.featured,
  cover:imgDraft.cover?.src||"",coverFit:imgDraft.cover?.spec||null,
  logo:imgDraft.logo?.src||"",logoFit:imgDraft.logo?.spec||null,
  screenshots:imgDraft.screenshots.map(x=>x.src),
  screenshotFit:imgDraft.screenshots.map(x=>x.spec||null)
 };
 const hf=document.querySelector("#homepage-form");
 const hero={...state.settings.homepage,
  heading:hf?.elements.heading?.value||state.settings.homepage.heading,
  subtitle:hf?.elements.subtitle?.value||state.settings.homepage.subtitle};
 return{
  game,hero,index,
  others:state.games.filter(x=>x.published&&x.id!==state.editingId).slice(0,2),
  render:{card:gameCard,detail:detailHTML,hero:heroHTML}
 };
}

async function runEditor(kind,item,file,index){
 try{await assertAdmin()}catch(e){toast(e.message);return null}
 if(file&&!hostReady(state.settings.imageHost)){
  toast("Tip: add your image-host details in Image Library & Hosting before saving an upload.");
 }
 try{
  return await openImageEditor({
   kind,file,src:item?.src,spec:item?.spec,index,
   ctx:makeCtx(kind,index),
   guard:assertAdmin,
   upload:(f,onP)=>uploadToHost(f,state.settings.imageHost,onP)
  });
 }catch(e){
  console.error(e);
  toast(e?.message==="Image could not be loaded"?"That image could not be loaded. Check the URL or file.":(e?.message||"Image editor failed."));
  return null;
 }
}

/* ---- Image Library & Hosting tab ---- */
function mediaTab(){
 const h=state.settings.imageHost,ok=hostReady(h);
 const lib=state.settings.mediaLibrary;
 return `<div class="panel"><h3>IMAGE HOSTING</h3><p class="section-sub">Images are stored on an image-hosting service, not in Firebase Storage and not inside Firestore. Only the hosted image reference and crop settings are saved in Firestore. GAMEVERSE uses <b>Cloudinary</b> (free plan, <i>unsigned upload preset</i> — no secret key is placed in the website). Images are selected from your computer; there is no image-URL paste option.</p><p class="status-pill ${ok?"ok":"warn"}">${ok?"● Image host connected":"● Not configured — uploads from your computer are disabled until you add this"}</p><form id="host-form" class="form-grid"><div class="form-row"><label>Cloudinary cloud name</label><input class="field" name="cloudName" value="${esc(h.cloudName)}" placeholder="e.g. demo123" autocomplete="off"></div><div class="form-row"><label>Unsigned upload preset</label><input class="field" name="uploadPreset" value="${esc(h.uploadPreset)}" placeholder="e.g. gameverse_unsigned" autocomplete="off"></div><div class="form-row"><label>Folder (optional)</label><input class="field" name="folder" value="${esc(h.folder||"")}" placeholder="gameverse"></div><div class="form-row full"><button class="btn btn-primary">SAVE HOSTING SETTINGS</button></div></form><details class="how"><summary>How to set up Cloudinary in 2 minutes</summary><ol><li>Create a free account at cloudinary.com and copy your <b>Cloud name</b> from the dashboard.</li><li>Settings → Upload → <b>Add upload preset</b>. Set <b>Signing mode = Unsigned</b>. Leave the format/transformations empty so originals (including transparent PNG/WebP) are kept untouched.</li><li>Paste the cloud name and preset name above and save.</li></ol></details></div>
 <div class="panel"><h3>WEBSITE IMAGE LIBRARY</h3><p class="section-sub">Upload and crop other website images. Select the exact visible area before saving.</p><div class="row-actions" style="margin-bottom:14px"><input class="field" id="lib-label" placeholder="Label (e.g. Community banner)" style="max-width:280px"><button class="btn btn-primary btn-small" id="lib-add" type="button">⬆ UPLOAD IMAGE</button></div>${lib.length?lib.map(it=>`<div class="admin-game-row lib-row"><div class="lib-thumb" style="aspect-ratio:${it.spec?.aspectValue||1.6}">${fitMarkup(it.spec,it.spec?.aspectValue||1.6,"")||`<img class="gv-img-plain" src="${esc(it.src)}" alt="">`}</div><div class="grow"><strong>${esc(it.label||"Untitled")}</strong><small>${esc(fitInfo(it))}</small></div><div class="row-actions"><button class="btn btn-small" data-lib="edit" data-id="${esc(it.id)}">✂ EDIT</button><button class="btn btn-small" data-lib="replace" data-id="${esc(it.id)}">REPLACE</button><button class="btn btn-small" data-lib="del" data-id="${esc(it.id)}">DELETE</button></div></div>`).join(""):'<div class="empty">No library images yet.</div>'}<p class="muted-note" style="text-align:left;margin-top:12px">Deleting removes the image from GAMEVERSE. The original file stays on your image host (free unsigned uploads cannot be deleted from a browser) — remove it in your host dashboard if needed.</p></div>`;
}

function wireMedia(){
 $("#host-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const d=new FormData(e.currentTarget);
  const next={provider:"cloudinary",cloudName:d.get("cloudName").trim(),uploadPreset:d.get("uploadPreset").trim(),folder:d.get("folder").trim().replace(/[^\w/-]/g,"")};
  if(!hostReady(next)){toast("Enter a valid cloud name and upload preset (letters, numbers, - _ .).");return}
  state.settings.imageHost=next;
  try{await persist();renderAdmin();toast("Image hosting saved.")}catch{}
 });
 const addItem=async(file,url)=>{
  const r=await runEditor("other",url?{src:url,spec:null}:null,file);
  if(!r)return;
  state.settings.mediaLibrary.push({id:"img-"+crypto.randomUUID(),label:($("#lib-label").value.trim()||"Untitled").slice(0,80),src:r.src,spec:r.spec,createdAt:Date.now()});
  try{await persist();renderAdmin();toast("Image saved to library.")}catch{}
 };
 $("#lib-add")?.addEventListener("click",async()=>{const f=await pickFiles(false);if(f.length)addItem(f[0])});
 $$("[data-lib]").forEach(b=>b.onclick=async()=>{
  const lib=state.settings.mediaLibrary,it=lib.find(x=>x.id===b.dataset.id);
  if(!it)return;
  const act=b.dataset.lib;
  const save=async msg=>{try{await persist();renderAdmin();toast(msg)}catch{}};
  if(act==="del"){if(!confirm("Delete this image from the library?"))return;state.settings.mediaLibrary=lib.filter(x=>x.id!==it.id);return save("Image deleted.")}
  if(act==="edit"){const r=await runEditor("other",{src:it.src,spec:specFor(it.src,it.spec)});if(r){Object.assign(it,{src:r.src,spec:r.spec});return save("Image updated.")}}
  if(act==="replace"){const f=await pickFiles(false);if(!f.length)return;const r=await runEditor("other",null,f[0]);if(r){Object.assign(it,{src:r.src,spec:r.spec});return save("Image replaced.")}}
 });
}

function wireImages(tab){
 if(tab==="add"){
  draftFromGame(state.games.find(x=>x.id===state.editingId)||{});
  mountField("cover");mountField("logo");mountGallery();
 }else if(tab==="homepage"){
  const h=state.settings.homepage;
  imgDraft.hero=h.heroImage?{src:h.heroImage,spec:specFor(h.heroImage,h.heroFit)}:null;
  mountField("hero");
 }else if(tab==="media"){
  wireMedia();
 }
}

async function persist(){
 try{
  await saveCloud();
 }catch(e){
  console.error("GAMEVERSE cloud save failed:",e);

  const detail=e?.code
   ?`${e.code}: ${e.message||""}`
   :(e?.message||"Unknown Firebase error");

  toast(`Cloud save failed: ${detail}`);
  throw e;
 }
}

function isUnlocked(){const expiry=Number(localStorage.getItem("gv_unlock_expires")||0);if(localStorage.getItem("gv_unlocked")==="yes"&&expiry>Date.now())return true;localStorage.removeItem("gv_unlocked");localStorage.removeItem("gv_unlock_expires");return false}
let visitStarted=false;
function startVisitorHeartbeat(){if(visitStarted)return;visitStarted=true;const send=()=>trackMetric("heartbeat");trackMetric("visit");send();setInterval(send,30000)}
function render(){
 const hash=location.hash||"#";
 if(hash!=="#admin"&&hash!=="#unlock"&&hash!=="#")startVisitorHeartbeat();

 if(hash==="#"||hash==="#unlock"){
  if(isUnlocked())navigate("#home");
  else renderUnlock();
  return;
 }

 if(hash==="#home"){
  renderHome();
  startVisitorHeartbeat();
  loadFooterStats();
  return;
 }

 if(hash==="#games"){
  renderGames();
  loadFooterStats();
  return;
 }

 if(hash==="#downloads"){
  renderDownloads();
  loadFooterStats();
  return;
 }

 if(hash.startsWith("#game/")){
  renderGame(decodeURIComponent(hash.slice(6)));
  loadFooterStats();
  return;
 }

 if(hash==="#contact"){
  renderContact();
  return;
 }

 if(hash==="#privacy"){
  renderPolicy("privacy");
  return;
 }

 if(hash==="#terms"){
  renderPolicy("terms");
  return;
 }

 if(hash==="#admin"){
  renderAdmin();
  return;
 }

 navigate("#home");
}

window.addEventListener("hashchange",render);

loadLocal();

// Render immediately from local/starter data. Firebase is initialized in the
// background so a slow or unavailable network can never hold the boot screen.
if(!location.hash){
 location.hash=localStorage.getItem("gv_unlocked")==="yes"?"#home":"#unlock";
}
render();

initFirebase().catch(e=>{
 console.error("GAMEVERSE background Firebase initialization failed:",e);
 toast("Cloud connection unavailable. Showing saved/local website content.");
});
