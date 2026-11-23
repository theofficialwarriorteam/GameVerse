// GAMEVERSE audio manager. Website audio is always silent while #play/<id> is active.
import { state } from './core.js';

const PREF_KEY = 'gv_audio_preferences_v1';
const DEFAULTS = { enabled: false, musicUrl: '', musicTitle: '', musicVolume: 35, uiSoundsEnabled: true, uiSoundsVolume: 22 };
let config = { ...DEFAULTS }, audio = null, previewAudio = null, ctx = null;
let playerActive = false, wasPlaying = false, fadeTimer = 0, lastEffectAt = 0, initialized = false;
let userPrefs = { muted: false, musicVolume: null, uiSoundsEnabled: null, uiSoundsVolume: null };
try { userPrefs = { ...userPrefs, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch {}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
const effectiveMusicVolume = () => userPrefs.musicVolume == null ? clamp(config.musicVolume,0,100) : clamp(userPrefs.musicVolume,0,100);
const effectiveUiEnabled = () => userPrefs.uiSoundsEnabled == null ? config.uiSoundsEnabled !== false : !!userPrefs.uiSoundsEnabled;
const effectiveUiVolume = () => userPrefs.uiSoundsVolume == null ? clamp(config.uiSoundsVolume,0,100) : clamp(userPrefs.uiSoundsVolume,0,100);
function savePrefs(){ try { localStorage.setItem(PREF_KEY, JSON.stringify(userPrefs)); } catch {} }
function getMusic(){ if (!audio) { audio = new Audio(); audio.loop = true; audio.preload = 'none'; audio.volume = 0; audio.addEventListener('error', () => console.warn('GAMEVERSE background music is unavailable.')); } return audio; }
function fadeTo(target, duration=450){
 const el=getMusic(); clearInterval(fadeTimer); const from=el.volume, to=clamp(target,0,1), steps=Math.max(1,Math.round(duration/30)); let n=0;
 fadeTimer=setInterval(()=>{ n++; el.volume=from+(to-from)*(n/steps); if(n>=steps){clearInterval(fadeTimer);fadeTimer=0;el.volume=to;if(to===0&&playerActive)el.pause();}},30);
}
function persistPrefs(){savePrefs();if(audio)fadeTo((userPrefs.muted||playerActive)?0:effectiveMusicVolume()/100);}
export function configureAudio(next){
 config={...DEFAULTS,...(next&&typeof next==='object'?next:{})};
 if(audio){audio.loop=true;if(audio.src!==config.musicUrl&&config.musicUrl){const t=audio.currentTime;audio.src=config.musicUrl;audio.load();try{audio.currentTime=t||0}catch{}}}
 if(initialized&&!playerActive&&config.enabled&&!userPrefs.muted&&config.musicUrl&&audio?.paused){/* Do not start music without a user gesture. */}
 if(audio&&!playerActive){
  if(userPrefs.muted||!config.enabled){fadeTo(0);setTimeout(()=>{if(audio&&(userPrefs.muted||!config.enabled)&&!playerActive)audio.pause();},500);}
  else fadeTo(effectiveMusicVolume()/100);
 }
 if(previewAudio)previewAudio.volume=clamp(config.musicVolume,0,100)/100;
}
export function initAudio(){
 if(initialized)return;initialized=true;
 document.addEventListener('click', e=>{
  const target=e.target.closest('button,a,[role="button"],input[type="checkbox"],summary');
  if(!target||target.closest('#gv-game-frame')||target.closest('.gv-player-page')||playerActive)return;
  if(target.matches('[data-audio-no-sfx],.no-sfx')||target.disabled)return;
  playUiSound(target.matches('#menu-btn,[data-tab]')?'pop':'click');
  // First explicit interaction unlocks audio; music still starts only if enabled by admin.
  if(config.enabled&&!userPrefs.muted&&config.musicUrl&&getMusic().paused){const m=getMusic();m.src=config.musicUrl;m.play().then(()=>fadeTo(effectiveMusicVolume()/100)).catch(()=>{});}
 },true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&audio&&!playerActive)fadeTo(0,180);else if(!document.hidden&&!playerActive&&audio&&!audio.paused)fadeTo((config.enabled&&!userPrefs.muted?effectiveMusicVolume():0)/100,250);});
}
export function setGamePlayerActive(active){
 active=!!active;if(active===playerActive)return;
 const m=getMusic();
 if(active){playerActive=true;wasPlaying=!m.paused&&!m.ended;clearInterval(fadeTimer);m.volume=0;m.pause();if(previewAudio){previewAudio.pause();previewAudio=null;} }
 else {playerActive=false;if(wasPlaying&&config.enabled&&config.musicUrl&&!userPrefs.muted){if(!m.src)m.src=config.musicUrl;m.play().then(()=>fadeTo(effectiveMusicVolume()/100,500)).catch(()=>{});}wasPlaying=false;}
}
export function getAudioState(){return {config:{...config},playerActive,muted:!!userPrefs.muted,musicVolume:effectiveMusicVolume(),uiSoundsEnabled:effectiveUiEnabled(),uiSoundsVolume:effectiveUiVolume(),playing:!!audio&&!audio.paused};}
export function setMusicVolume(v){userPrefs.musicVolume=clamp(v,0,100);persistPrefs();return effectiveMusicVolume();}
export function setUiSoundVolume(v){userPrefs.uiSoundsVolume=clamp(v,0,100);savePrefs();return effectiveUiVolume();}
export function setUiSoundsEnabled(v){userPrefs.uiSoundsEnabled=!!v;savePrefs();return effectiveUiEnabled();}
export function toggleMusicMute(){userPrefs.muted=!userPrefs.muted;persistPrefs();return !userPrefs.muted;}
export async function toggleMusicPlayback(){
 if(playerActive||!config.musicUrl)return false;
 const m=getMusic();if(!m.src)m.src=config.musicUrl;
 if(m.paused){try{await m.play();fadeTo(userPrefs.muted?0:effectiveMusicVolume()/100);return true;}catch{return false;}}
 fadeTo(0,250);setTimeout(()=>m.pause(),270);return false;
}
export function previewMusic(url=config.musicUrl){
 if(playerActive||!url)return false;
 if(previewAudio){previewAudio.pause();previewAudio=null;}
 previewAudio=new Audio(url);previewAudio.volume=effectiveMusicVolume()/100;previewAudio.play().catch(()=>{});previewAudio.addEventListener('ended',()=>{previewAudio=null;},{once:true});return true;
}
export function stopPreview(){if(previewAudio){previewAudio.pause();previewAudio=null;}}
export function playUiSound(kind='click'){
 if(playerActive||!effectiveUiEnabled()||effectiveUiVolume()<=0)return;
 const now=performance.now();if(now-lastEffectAt<65)return;lastEffectAt=now;
 try{
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  if(!ctx)ctx=new AC();if(ctx.state==='suspended')ctx.resume();
  const osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime,vol=effectiveUiVolume()/100;
  const tones={click:[620,760],pop:[480,880],success:[660,990],error:[330,240],toggle:[520,700]};
  const pair=tones[kind]||tones.click;osc.type='sine';osc.frequency.setValueAtTime(pair[0],t);osc.frequency.exponentialRampToValueAtTime(pair[1],t+.055);
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,.045*vol),t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+.095);
  osc.connect(gain);gain.connect(ctx.destination);osc.start(t);osc.stop(t+.1);
 }catch{}
}
