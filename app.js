
import { firebaseConfig, ADMIN_EMAIL, FIREBASE_CONFIGURED, IMAGE_HOST } from "./firebase-config.js";
import { ACCEPT, FRAME, validateFile, hostReady, uploadToHost, openImageEditor, fitMarkup, logoMarkup, plainLogoMarkup, focalMarkup, specFor, sanitizeSpec, isHttpUrl, isRenderableUrl } from "./image-editor.js";
import { state, $, $$, esc, isValidUrl, toast, navigate, sleep, clearTimers, confirmDialog } from "./core.js";
import { loadConfig, loadMe, startTracking, trackGame } from "./api.js";
import { header, footer, initGlobalUI, gateBlocks, stashReturn, statsSectionHTML, hydrateStats, hydrateFooterStats, hydrateCardStats, communityBarHTML, ratingPanelHTML, hydrateGameCommunity, feedbackSectionHTML, wireFeedback, renderDownloads, renderDownloadDetails, renderAccessPage } from "./ui-public.js";
import { mountAdminFeature } from "./ui-admin.js";
import { initAudio, configureAudio, setGamePlayerActive } from "./audio.js";


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

Object.assign(state,{games:[...STARTER_GAMES],settings:structuredClone(DEFAULT_SETTINGS)});


const app=$("#app");











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

let cloudResolve,authResolve;
const cloudReady=new Promise(r=>cloudResolve=r);
const authReady=new Promise(r=>authResolve=r);
async function initFirebase(){
 if(!FIREBASE_CONFIGURED){cloudResolve();authResolve();return}
 try{
  const [appMod,authMod,dbMod]=await Promise.all([
   import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
   import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
   import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js")
  ]);
  const fbApp=appMod.initializeApp(firebaseConfig);
  const auth=authMod.getAuth(fbApp);
  const db=dbMod.getFirestore(fbApp);
  // GAMEVERSE uses Firestore and hosted image URLs. Firebase Storage is not required.
  state.fb={...authMod,...dbMod,auth,db};
  await loadCloudPublic();
  cloudResolve();
  authMod.onAuthStateChanged(auth,async user=>{
   state.user=user&&user.email?.toLowerCase()===ADMIN_EMAIL&&user.emailVerified?user:null;
   if(user && user.email?.toLowerCase()!==ADMIN_EMAIL){
    await authMod.signOut(auth);
    toast("This account is not authorized for GAMEVERSE administration.","error");
   }
   authResolve();
   if(location.hash==="#admin")render();
  });
 }catch(e){
  console.error(e);
  cloudResolve();authResolve();
  toast("Firebase could not initialize. Check firebase-config.js.","error");
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
 const added=g.createdAt?new Date(g.createdAt).toLocaleDateString(undefined,{month:"short",year:"numeric"}):"";
 const player=g.player||{};
 let playable=false, externalUrl="";
 try{const u=new URL(player.embedUrl);playable=player.enabled===true&&u.protocol==="https:"&&u.origin!==location.origin}catch{}
 try{const u=new URL(g.url);if((u.protocol==="https:"||u.protocol==="http:")&&u.origin!==location.origin)externalUrl=u.href}catch{}
 const playAction=playable
  ?`<a class="btn btn-primary gv-play-cta" id="play-game-btn" href="#play/${encodeURIComponent(g.id)}">PLAY NOW ▶</a>`
  :externalUrl
   ?`<a class="btn btn-primary gv-play-cta" id="play-game-btn" href="${esc(externalUrl)}" target="_blank" rel="noopener noreferrer">PLAY NOW ↗</a>`
   :'<div class="gv-player-unavailable">This game does not have a valid play link yet. Please check back later.</div>';
 const playLabel=playable?"Browser playable":externalUrl?"External game link":"Play link unavailable";
 return `<a class="btn btn-ghost btn-small" href="#games">← BACK TO LIBRARY</a><div class="game-detail" style="margin-top:28px"><div><div class="detail-image">${coverInner(g)}</div>${screenshotHTML(g)}</div><div class="detail-copy"><div class="eyebrow">${esc(g.category||"GAME")}</div><h1>${esc(g.title)}</h1>${communityBarHTML()}<p>${esc(g.description||g.shortDescription||"")}</p><div class="chips" style="margin:6px 0 14px"><span class="gc-chip">${esc(g.category||"Game")}</span>${added?`<span class="gc-chip">Added ${esc(added)}</span>`:""}<span class="gc-chip">Free to play</span><span class="gc-chip">${playLabel}</span></div><div class="gv-game-facts"><span><b>DEVICE</b> ${esc(g.supportedDevices||"PC / Mobile (if supported)")}</span><span><b>REQUIREMENTS</b> ${esc(g.requirements||"See game provider")}</span></div>${playAction}</div></div>${ratingPanelHTML()}${feedbackSectionHTML(g)}`;
}
function controlsText(items){return (Array.isArray(items)?items:[]).map(c=>[c.name,c.key,c.description,c.icon].filter(Boolean).join(" | ")).join("\n")}
function parseControls(value){return String(value||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{const [name,key,description,icon]=line.split("|").map(x=>x.trim());return{name:(name||"").slice(0,60),key:(key||"").slice(0,40),description:(description||"").slice(0,180),icon:(icon||"").slice(0,24)}}).filter(x=>x.name)}
function renderGamePlayer(id){
 setGamePlayerActive(true);
 const g=state.games.find(x=>x.id===id&&x.published);if(!g){navigate("#games");return}
 const p=g.player||{};let embed="";try{if(p.enabled===true&&new URL(p.embedUrl).protocol==="https:"&&new URL(p.embedUrl).origin!==location.origin)embed=p.embedUrl}catch{}
 const ratio=["16 / 9","4 / 3","21 / 9","1 / 1","auto"].includes(p.aspectRatio)?p.aspectRatio:"16 / 9";
 const mobile=window.matchMedia?.("(pointer: coarse)").matches||window.innerWidth<760;const controls=mobile?(p.mobileControls||[]):(p.pcControls||[]);
 const controlsHTML=controls.length?`<section class="gv-controls-panel"><div class="eyebrow">${mobile?"MOBILE CONTROLS":"PC CONTROLS"}</div><h2>HOW TO PLAY</h2><div class="gv-control-grid">${controls.map(c=>`<div class="gv-control"><span class="gv-control-icon">${esc(c.icon||"⌨")}</span><span><b>${esc(c.name)}</b><small>${esc(c.key||"")}</small>${c.description?`<em>${esc(c.description)}</em>`:""}</span></div>`).join("")}</div></section>`:"";
 app.innerHTML=`${header()}<main class="page-shell container gv-player-page"><div class="gv-player-top"><a class="btn btn-ghost btn-small" href="#game/${encodeURIComponent(g.id)}">← EXIT GAME</a><div><div class="eyebrow">NOW PLAYING</div><h1>${esc(g.title)}</h1></div><span class="gc-chip">GAMEVERSE PLAYER</span></div>${embed?`<section class="gv-player-shell"><div class="gv-player-loading" id="gv-player-loading"><span class="gv-player-spinner"></span><b>${esc(p.loadingText||"Loading game...")}</b><small>The game host may restrict embedded playback.</small></div><div class="gv-player-frame" style="aspect-ratio:${esc(ratio)};background:${/^#[0-9a-fA-F]{6}$/.test(p.background||"")?p.background:"#080b12"}"><iframe id="gv-game-frame" src="${esc(embed)}" title="${esc(g.title)} game" loading="eager" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups" allow="fullscreen; autoplay; gamepad" ${p.allowFullscreen===false?"":"allowfullscreen"}></iframe></div><p class="gv-player-host-note">If the game stays blank or fails to load, its provider may block iframe embedding. Ask the admin to use an official embed URL.</p><div class="gv-player-actions"><button class="btn btn-primary" id="gv-fullscreen" ${p.allowFullscreen===false?"disabled":""}>⛶ FULLSCREEN</button><a class="btn btn-ghost" href="#game/${encodeURIComponent(g.id)}">EXIT GAME</a></div></section>`:`<section class="gv-player-unavailable gv-player-error"><h2>GAME PLAYER UNAVAILABLE</h2><p>This game has no valid HTTPS embedded player configured. Ask the administrator to configure its player URL.</p><a class="btn btn-primary" href="#game/${encodeURIComponent(g.id)}">BACK TO GAME DETAILS</a></section>`}<section class="gv-player-about"><div class="eyebrow">GAME INFORMATION</div><h2>${esc(g.title)}</h2><p>${esc(g.description||g.shortDescription||"")}</p></section>${controlsHTML}</main>${footer()}`;
 const frame=$("#gv-game-frame");if(frame)frame.addEventListener("load",()=>$("#gv-player-loading")?.classList.add("is-hidden"));
 $("#gv-fullscreen")?.addEventListener("click",async()=>{try{await frame?.requestFullscreen?.()}catch{toast("Fullscreen is unavailable for this game.","error")}});
 trackGame("play",g.id);hydrateFooterStats();
}

function heroHTML(h){
 const spec=h.heroImage?specFor(h.heroImage,h.heroFit):null;
 const bg=h.heroImage&&isRenderableUrl(h.heroImage)
  ?`<div class="gv-hero-bg">${spec?fitMarkup(spec,FRAME.heroDesktop,""):focalMarkup(h.heroImage,{x:50,y:50},1,"")}</div><div class="hero-shade"></div>`:"";
 return `<section class="hero ${bg?"hero-custom":""}">${bg}<div class="hero-content"><div class="eyebrow">WELCOME TO GAMEVERSE</div><h1>${esc(h.heading).replace("GAMING WORLD.",'<span>GAMING WORLD.</span>')}</h1><p>${esc(h.subtitle)}</p><div class="hero-buttons"><a class="btn btn-primary" href="#games">EXPLORE GAMES ↗</a><a class="btn btn-ghost" href="#contact">JOIN COMMUNITY</a></div></div></section>`;
}

function gameCard(g){
 return `<article class="game-card"><a href="#game/${encodeURIComponent(g.id)}"><div class="game-cover">${coverInner(g)}${g.featured?'<span class="tag">FEATURED</span>':""}</div><div class="game-info"><h3>${esc(g.title)}</h3><p>${esc(g.shortDescription||"Explore this game on GAMEVERSE.")}</p><div class="gc-stats" data-gid="${esc(g.id)}"></div><div class="game-meta"><small>${esc(g.category||"Game")}</small><span class="btn btn-small">VIEW GAME ↗</span></div></div></a></article>`;
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

function adsterraUnit(placement){
 const units={
  homeTop:{kind:"banner",key:"f59c36d29f3c6dee21e0b7e8b0cb834c",width:728,height:90,desktop:true},
  homeBottom:{kind:"native",key:"f6d34684d8888a723da442a7378d5baf"},
  gamesBottom:{kind:"banner",key:"fb132a810c078843b7c5bee0d426e47e",width:320,height:50},
  gameTop:{kind:"banner",key:"03b1777122983b9454d3cdebbe22144c",width:300,height:250}
 };
 const unit=units[placement];
 if(!unit)return "";
 if(unit.kind==="native")return `<div class="gv-ad gv-adsterra gv-adsterra-native" data-adsterra="native" data-ad-key="${unit.key}"><small class="gv-ad-label">Advertisement</small><div id="container-${unit.key}"></div></div>`;
 return `<div class="gv-ad gv-adsterra gv-adsterra-banner ${unit.desktop?"desktop-only":""}" data-adsterra="banner" data-ad-key="${unit.key}" data-ad-width="${unit.width}" data-ad-height="${unit.height}"><small class="gv-ad-label">Advertisement</small><div class="gv-adsterra-frame" style="width:${unit.width}px;height:${unit.height}px;max-width:100%"></div></div>`;
}

function adPlacement(placement){
 const direct=directAdMarkup(placement);
 const google=adSenseUnit(placement);
 const adsterra=adsterraUnit(placement);
 return direct||google||adsterra?`<section class="gv-ad-placement container" aria-label="Advertisements">${direct}${google}${adsterra}</section>`:"";
}

function mountAdsterra(){
 document.querySelectorAll("[data-adsterra]:not([data-adsterra-loaded])").forEach(slot=>{
  const kind=slot.dataset.adsterra, key=slot.dataset.adKey;
  if(!key)return;
  slot.dataset.adsterraLoaded="1";
  const script=document.createElement("script");
  script.async=true;
  script.dataset.cfasync="false";
  if(kind==="native"){
   script.fetchPriority="high";
   script.src=`https://bauval.org/21/${key}`;
   slot.appendChild(script);
  }else{
   const width=Number(slot.dataset.adWidth),height=Number(slot.dataset.adHeight);
   window.atOptions={key,format:"iframe",height,width,params:{}};
   script.src=`https://bauval.org/22/${key}`;
   slot.querySelector(".gv-adsterra-frame")?.appendChild(script);
  }
 });
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

 app.innerHTML=`${header()}<main>${heroHTML(h)}${adPlacement("homeTop")}${statsSectionHTML()}
 <section class="section container"><div class="section-head"><div><div class="eyebrow">HANDPICKED FOR YOU</div><h2>FEATURED GAMES</h2><div class="section-sub">Start your next adventure.</div></div><a class="btn btn-ghost" href="#games">VIEW ALL GAMES ↗</a></div><div class="game-grid">${featured.length?featured.map(gameCard).join(""):'<div class="empty">No featured games yet.</div>'}</div></section>
 <section class="section container" style="padding-top:0"><div class="section-head"><div><div class="eyebrow">FRESH DROPS</div><h2>RECENTLY ADDED</h2></div></div><div class="game-grid">${recent.length?recent.map(gameCard).join(""):'<div class="empty">Games will appear here when published.</div>'}</div></section>${adPlacement("homeBottom")}
 <section class="section container"><div class="panel" style="display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap"><div><div class="eyebrow">JOIN THE COMMUNITY</div><h2 style="font:800 34px 'Barlow Condensed';margin:8px 0">${esc(h.communityText)}</h2><p class="section-sub">Follow Winjo Gamerz and connect with other players.</p></div><a class="btn btn-primary" href="${esc(state.settings.contact.discord)}" target="_blank" rel="noopener">JOIN DISCORD ↗</a></div></section></main>${footer()}`;
 mountAdSense();
 mountAdsterra();
 hydrateStats();
 hydrateFooterStats();
 hydrateCardStats();
}

function renderGames(){
 const games=state.games.filter(g=>g.published);

 app.innerHTML=`${header()}<main class="page-shell container"><div class="page-head"><div class="eyebrow">THE COLLECTION</div><h1 class="page-title">GAME LIBRARY</h1><p>Explore the collection and find your next game.</p></div>${adPlacement("gamesTop")}<div class="toolbar"><input id="game-search" class="field search" placeholder="Search games..."><select id="category-filter" class="field" style="max-width:190px"><option value="">All categories</option>${[...new Set(games.map(g=>g.category||"Other"))].map(c=>`<option>${esc(c)}</option>`).join("")}</select></div><div class="game-grid" id="library-grid">${games.map(gameCard).join("")||'<div class="empty">No published games yet.</div>'}</div>${adPlacement("gamesBottom")}</main>${footer()}`;
 mountAdSense();
 mountAdsterra();

 const filter=()=>{
  const q=$("#game-search").value.toLowerCase();
  const c=$("#category-filter").value;
  const found=games.filter(g=>(g.title+" "+g.shortDescription).toLowerCase().includes(q)&&(!c||g.category===c));
  $("#library-grid").innerHTML=found.map(gameCard).join("")||'<div class="empty">No games match your search.</div>';
 };

 $("#game-search").addEventListener("input",filter);
 $("#category-filter").addEventListener("change",filter);
 hydrateFooterStats();
 hydrateCardStats();
}

function renderGame(id){
 const g=state.games.find(x=>x.id===id&&x.published);
 if(!g){navigate("#games");return}
 app.innerHTML=`${header()}<main class="page-shell container">${adPlacement("gameTop")}${detailHTML(g)}${adPlacement("gameBottom")}</main>${footer()}`;
 $("#play-game-btn")?.addEventListener("click",()=>trackGame("play",g.id));
 mountAdSense();mountAdsterra();trackGame("view",g.id);hydrateGameCommunity(g);wireFeedback(g);hydrateFooterStats();
}

function renderContact(){
 const c=state.settings.contact;

 app.innerHTML=`${header()}<main class="page-shell container"><div class="page-head"><div class="eyebrow">WE'RE HERE TO HELP</div><h1 class="page-title">${esc(c.heading)}</h1><p>${esc(c.description)}</p></div><div class="contact-grid"><div class="contact-card"><div class="task-icon">◈</div><h3>DISCORD SUPPORT</h3><p>Join our Discord community for game issues, broken links, suggestions and new game requests.</p><a class="btn btn-primary" href="${esc(c.discord)}" target="_blank" rel="noopener">JOIN OUR DISCORD ↗</a></div><div class="contact-card"><div class="task-icon">▶</div><h3>WINJO GAMERZ</h3><p>Subscribe to our YouTube channel for gaming videos and GAMEVERSE updates.</p><a class="btn" href="${esc(c.youtube)}" target="_blank" rel="noopener">VISIT CHANNEL ↗</a></div></div>${feedbackSectionHTML(null)}</main>${footer()}`;
 wireFeedback(null);
 hydrateFooterStats();
}

function renderPolicy(kind){
 const privacy=kind==="privacy";

 app.innerHTML=`${header()}<main class="page-shell container"><div class="page-head"><div class="eyebrow">GAMEVERSE INFORMATION</div><h1 class="page-title">${privacy?"PRIVACY POLICY":"TERMS OF USE"}</h1></div><div class="panel"><p class="section-sub">${privacy?"GAMEVERSE stores a random anonymous visitor ID in your browser's local storage. It is used to count unique visitors and who is currently online, to remember your task progress and temporary access, to keep one rating per game, and to avoid counting the same game view twice. It contains no name, e-mail address or other personal data. Our server (a Cloudflare Worker with a D1 database) stores that random ID with timestamps, game view and Play Now click counts, star ratings, feedback messages you choose to send, task confirmations, and temporary access records. Please do not include personal information in feedback. Your IP address is used only briefly to limit abuse (as a salted hash that expires within hours) and is not stored with your activity. Download files and cover images are hosted by third-party HTTPS providers; GameVerse stores only their links. Tasks such as visiting YouTube or joining Discord are self-confirmed by you and are not verified with those services. Public game and website settings may be stored in Firebase, and admin authentication is handled by Firebase Authentication. If Firebase is configured, public game and website settings may be stored in Firebase. Admin authentication is handled by Firebase Authentication. If Google AdSense is enabled, Google and its advertising partners may use cookies or similar technologies to serve, measure and personalize ads according to your settings and applicable consent requirements. Direct sponsor banners link to third-party websites that have their own privacy practices. Before enabling advertising, publish a complete privacy and cookie notice explaining the providers used, data processing, consent choices and contact details, and configure any consent tools required for your visitors.":"GAMEVERSE is an independent directory that links to third-party game websites. External sites control their own content, availability and terms. GAMEVERSE is not affiliated with or endorsed by Rockstar Games. Only use external content where you have the right to access and share it. Replace this starter text with reviewed terms before public launch."}</p></div></main>${footer()}`;
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

 app.innerHTML=`${header()}<div class="admin-layout"><aside class="admin-side"><h4>CONTROL CENTER</h4><div class="admin-nav">${[["overview","▦ OVERVIEW & ANALYTICS"],["games","▣ MANAGE GAMES"],["add","＋ ADD NEW GAME"],["downloads","⬇ DOWNLOAD MANAGER"],["tasks","◈ TASKS & ACCESS"],["rewarded","★ REWARDED ADS"],["features","⚙ FEATURE CONTROLS"],["feedback","✉ PLAYER FEEDBACK"],["audio","♫ BACKGROUND MUSIC & SOUND"],["homepage","⌂ HOMEPAGE SETTINGS"],["contact","✉ CONTACT SETTINGS"],["media","▧ IMAGE LIBRARY & HOSTING"],["ads","▤ ADVERTISEMENT SETTINGS"]].map(([id,label])=>`<button data-tab="${id}" class="${tab===id?"active":""}">${label}</button>`).join("")}<button id="admin-logout">↪ LOG OUT</button></div></aside><section class="admin-main"><div class="admin-top"><div><div class="eyebrow">GAMEVERSE CONTROL CENTER</div><h1>${({overview:"OVERVIEW & ANALYTICS",games:"MANAGE GAMES",add:state.editingId?"EDIT GAME":"ADD NEW GAME",downloads:"DOWNLOAD MANAGER",tasks:"TASKS & ACCESS",rewarded:"REWARDED ADS",features:"FEATURE CONTROLS",feedback:"PLAYER FEEDBACK",audio:"BACKGROUND MUSIC & SOUND",homepage:"HOMEPAGE SETTINGS",contact:"CONTACT SETTINGS",media:"IMAGE LIBRARY & HOSTING",ads:"ADVERTISEMENT SETTINGS"})[tab]}</h1><small style="color:var(--muted)">${esc(state.user.email)}</small></div><a class="btn btn-ghost btn-small" href="#home">VIEW WEBSITE ↗</a></div>${adminContent(tab)}</section></div>${footer()}`;

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
 if(["overview","downloads","tasks","rewarded","features","feedback","audio"].includes(tab)){const rerender=()=>renderAdmin();rerender.persist=persist;mountAdminFeature(tab,rerender);}
}



function adminContent(tab){
 if(["overview","downloads","features","feedback","tasks","rewarded","audio"].includes(tab))return '<div id="admin-feature-root"></div>';

 if(tab==="games")return `<div class="panel"><h3>YOUR GAME LIBRARY</h3><div class="row-actions" style="margin-bottom:15px"><button class="btn btn-primary btn-small" data-quick="add">＋ ADD GAME</button><button class="btn btn-small" id="seed-games">RESTORE STARTER GAMES</button><button class="btn btn-small" id="bulk-game-embed">SET ALL HTTPS GAME URLS AS EMBED URLS</button></div><p class="muted-note left">Copies each existing HTTPS game URL into its player embed URL and enables the in-site player. Some providers block iframe embedding; test each game and disable blocked ones individually.</p>${state.games.map(g=>`<div class="admin-game-row">${thumbHTML(g)}<div class="grow"><strong>${esc(g.title)}</strong><small>${g.published?"Published":"Draft"} · ${esc(g.category||"Other")}</small></div><div class="row-actions"><button class="btn btn-small" data-edit="${esc(g.id)}">EDIT</button><button class="btn btn-small" data-delete="${esc(g.id)}">DELETE</button></div></div>`).join("")}</div>`;

 if(tab==="add")return gameForm();

 

 

 

 

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
 const player=g.player||{};

 return `<div class="panel"><h3>${state.editingId?"EDIT GAME":"GAME DETAILS"}</h3><form id="game-form" class="form-grid"><div class="form-row"><label>Game title *</label><input class="field" name="title" required value="${esc(g.title)}"></div><div class="form-row"><label>Category</label><input class="field" name="category" value="${esc(g.category)}"></div><div class="form-row full"><label>Short description</label><input class="field" name="shortDescription" value="${esc(g.shortDescription)}"></div><div class="form-row full"><label>Full description</label><textarea class="field" name="description">${esc(g.description)}</textarea></div><div class="form-row"><label>Supported devices</label><input class="field" name="supportedDevices" value="${esc(g.supportedDevices||"PC / Mobile (if supported)")}" placeholder="PC, Android, iOS"></div><div class="form-row"><label>Game requirements</label><input class="field" name="requirements" value="${esc(g.requirements||"")}" placeholder="Browser, RAM, controller, etc."></div><div class="form-row full"><label>Legacy / reference URL (optional)</label><input class="field" name="url" type="url" value="${esc(g.url)}" placeholder="https://..."></div><div class="form-row full gv-admin-player-config"><h3>GAME PLAYER CONFIGURATION</h3><p class="muted-note left">Use the existing HTTPS game URL as the initial embed URL. Some providers block iframe embedding; test and disable blocked games.</p><label class="check-row"><input type="checkbox" name="playerEnabled" ${(player.enabled || (!state.editingId && /^https:\/\//i.test(g.url||"")))?"checked":""}> ENABLE IN-SITE GAME PLAYER</label><div class="form-row"><label>Launch type</label><select class="field" name="launchType"><option value="embed" ${(player.launchType||"embed")==="embed"?"selected":""}>Embedded game URL</option><option value="html5" ${player.launchType==="html5"?"selected":""}>Hosted HTML5 game URL (iframe)</option></select></div><div class="form-row"><label>HTTPS embed URL</label><input class="field" name="embedUrl" type="url" value="${esc(player.embedUrl||((/^https:\/\//i.test(g.url||""))?g.url:""))}" placeholder="https://trusted-host.example/embed"></div><div class="form-row"><label>Player aspect ratio</label><select class="field" name="aspectRatio">${["16 / 9","4 / 3","21 / 9","1 / 1","auto"].map(v=>`<option value="${v}" ${(player.aspectRatio||"16 / 9")===v?"selected":""}>${v}</option>`).join("")}</select></div><div class="form-row"><label>Player background</label><input class="field" name="playerBackground" type="color" value="${/^#[0-9a-fA-F]{6}$/.test(player.background||"")?player.background:"#080b12"}"></div><div class="form-row"><label>Loading message</label><input class="field" name="loadingText" maxlength="90" value="${esc(player.loadingText||"Loading game...")}"></div><div class="form-row full"><label class="check-row"><input type="checkbox" name="allowFullscreen" ${player.allowFullscreen===false?"":"checked"}> ALLOW FULLSCREEN</label></div><div class="form-row full"><label>PC controls — one per line: Name | Key/Button | Description | Icon (optional)</label><textarea class="field" name="pcControls" rows="5" placeholder="Movement | W, A, S, D | Move your character | ⌨&#10;Jump | Space | Jump | ↑">${esc(controlsText(player.pcControls))}</textarea></div><div class="form-row full"><label>Mobile controls — one per line: Name | Touch control | Description | Icon (optional)</label><textarea class="field" name="mobileControls" rows="5" placeholder="Movement | Virtual joystick | Move your character | ◉&#10;Jump | Jump button | Jump | ↑">${esc(controlsText(player.mobileControls))}</textarea></div></div><div class="form-row full"><label>Main cover image — landscape 16:9</label><div data-imgfield="cover"></div></div><div class="form-row full"><label>Game logo (optional) — transparent PNG/WebP supported</label><div data-imgfield="logo"></div></div><div class="form-row full"><label>Screenshots — each one is cropped individually</label><div data-imggallery></div></div><div class="form-row"><label class="check-row"><input type="checkbox" name="featured" ${g.featured?"checked":""}> Featured game</label><label class="check-row"><input type="checkbox" name="published" ${g.published?"checked":""}> Publish game</label></div><div class="form-row full"><small class="muted-note" style="text-align:left">Choose an image from your computer, select the visible crop area, and save. Crop settings are saved with the game.</small></div><div class="form-row full"><div class="row-actions"><button class="btn btn-primary">SAVE GAME</button><button class="btn" type="button" id="cancel-edit">CANCEL</button></div></div></form></div>`;
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
  if(!await confirmDialog("Delete this game permanently?",{danger:true,confirmText:"Confirm"}))return;
  state.games=state.games.filter(g=>g.id!==b.dataset.delete);
  await persist();
  renderAdmin();
  toast("Game deleted.");
 });

  $("#bulk-game-embed")?.addEventListener("click",async()=>{
   const candidates=state.games.filter(g=>/^https:\/\//i.test(g.url||""));
   if(!candidates.length){toast("No existing HTTPS game URLs were found.","info");return;}
   if(!await confirmDialog(`Configure ${candidates.length} existing game URL(s) as HTTPS embed URLs and enable their in-site players? Some hosts may block embedding; you can disable those games individually after testing.`,{title:"Configure all game embeds?",confirmText:"Configure"}))return;
   state.games=state.games.map(g=>/^https:\/\//i.test(g.url||"")?{...g,player:{...(g.player||{}),enabled:true,launchType:g.player?.launchType||"embed",embedUrl:g.player?.embedUrl||g.url,aspectRatio:g.player?.aspectRatio||"16 / 9",background:g.player?.background||"#080b12",loadingText:g.player?.loadingText||"Loading game...",allowFullscreen:g.player?.allowFullscreen!==false,pcControls:g.player?.pcControls||[],mobileControls:g.player?.mobileControls||[]}}:g);
   await persist();renderAdmin();toast(`Configured ${candidates.length} HTTPS game URL(s). Test each game and disable any host that blocks embedding.`,"success");
  });

 $("#seed-games")?.addEventListener("click",async()=>{
  if(!await confirmDialog("Restore the original starter game list? Existing games with matching IDs will be replaced.",{danger:true,confirmText:"Confirm"}))return;
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
  const configuredEmbed=String(d.get("embedUrl")||"").trim();
  if(d.has("playerEnabled")&&(!isValidUrl(configuredEmbed)||new URL(configuredEmbed).protocol!=="https:"||new URL(configuredEmbed).origin===location.origin)){
   toast("Use a valid HTTPS embed URL hosted on a different origin from GameVerse.");return;
  }

  let id=state.editingId||("game-"+crypto.randomUUID());

  let game={
   id,
   title,
   category:d.get("category").trim()||"Other",
   shortDescription:d.get("shortDescription").trim(),
   description:d.get("description").trim(),
   supportedDevices:String(d.get("supportedDevices")||"").trim(),
   requirements:String(d.get("requirements")||"").trim(),
   url,
   player:{enabled:d.has("playerEnabled"),launchType:d.get("launchType")||"embed",embedUrl:configuredEmbed,aspectRatio:d.get("aspectRatio")||"16 / 9",background:/^#[0-9a-fA-F]{6}$/.test(d.get("playerBackground")||"")?d.get("playerBackground"):"#080b12",loadingText:String(d.get("loadingText")||"Loading game...").trim().slice(0,90),allowFullscreen:d.has("allowFullscreen"),pcControls:parseControls(d.get("pcControls")),mobileControls:parseControls(d.get("mobileControls"))},
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
  if(!await confirmDialog("Delete this sponsored campaign?",{danger:true,confirmText:"Confirm"}))return;
  state.settings.ads.directCampaigns=(state.settings.ads.directCampaigns||[]).filter(x=>x.id!==b.dataset.campaignDelete);await persist();renderAdmin();toast("Campaign deleted.");
 });
}


/* =====================================================================
   IMAGE MANAGEMENT (admin only)
   ===================================================================== */
const imgDraft={cover:null,logo:null,hero:null,screenshots:[]};


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
 box.querySelector('[data-imgact="remove"]').onclick=async()=>{
  if(!await confirmDialog("Remove this image from the form? (The file stays on your image host.)",{danger:true,confirmText:"Confirm"}))return;
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
  if(act==="del"){if(await confirmDialog("Remove this screenshot?",{danger:true,confirmText:"Confirm"})){imgDraft.screenshots.splice(i,1);mountGallery()}return}
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
  if(act==="del"){if(!await confirmDialog("Delete this image from the library?",{danger:true,confirmText:"Confirm"}))return;state.settings.mediaLibrary=lib.filter(x=>x.id!==it.id);return save("Image deleted.")}
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




function render(){
 clearTimers();
 const hash=location.hash||"#";
 setGamePlayerActive(hash.startsWith("#play/"));
 if(hash==="#"){navigate(gateBlocks()?"#unlock":"#home");return}
 if(hash==="#unlock"){renderAccessPage("gate");return}
 if(hash==="#admin"){renderAdmin();return}
 if(!["#privacy","#terms","#contact"].includes(hash)&&gateBlocks()){stashReturn();navigate("#unlock");return}
 if(hash==="#home"){renderHome();return}
 if(hash==="#games"){renderGames();return}
 if(hash==="#downloads"){renderDownloads();return}
 if(hash.startsWith("#download-preview/")){renderDownloadDetails(decodeURIComponent(hash.slice(18)),true);return}
 if(hash.startsWith("#download/")){renderDownloadDetails(decodeURIComponent(hash.slice(10)));return}
 if(hash==="#tasks"){
  if(state.apiStatus==="ok"&&!state.cfg.features.tasks){navigate("#home");return}
  renderAccessPage("tasks");return;
 }
 if(hash.startsWith("#game/")){renderGame(decodeURIComponent(hash.slice(6)));return}
 if(hash.startsWith("#play/")){renderGamePlayer(decodeURIComponent(hash.slice(6)));return}
 if(hash==="#contact"){renderContact();return}
 if(hash==="#privacy"){renderPolicy("privacy");return}
 if(hash==="#terms"){renderPolicy("terms");return}
 navigate("#home");
}

window.addEventListener("hashchange",render);

loadLocal();
initGlobalUI();

// Boot: start Firebase in the background, wait (briefly) for the API config and visitor
// profile so the unlock gate can decide before the first paint, then render once.
// Slow or unavailable services never block the site: everything has a time limit.
async function bootApi(){
 await Promise.race([cloudReady,sleep(3000)]);
 await loadConfig();
 configureAudio(state.cfg?.audio);
 initAudio();
 await loadMe();
}
initFirebase().catch(e=>{
 console.error("GAMEVERSE background Firebase initialization failed:",e);
 toast("Cloud connection unavailable. Showing saved/local website content.","error");
});
let booted=false;
const apiReady=bootApi();
cloudReady.then(()=>{if(booted&&location.hash!=="#admin")render()});
(async()=>{
 await Promise.race([apiReady,sleep(4000)]);
 if(!location.hash)location.hash="#home";
 booted=true;
 render();
 await apiReady;
 if(!booted)return;
 if(location.hash!=="#admin")render();
 await Promise.race([authReady,sleep(2500)]); // let the admin session load so admin traffic is never counted
 startTracking();
})();
