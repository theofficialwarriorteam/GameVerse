import json, urllib.request, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8788"
GAMES = [
  {"id": "game-a", "title": "Alpha Racer", "category": "Racing", "shortDescription": "Fast cars.", "description": "A fast racing game with many tracks.", "url": "https://example.com/alpha", "cover": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><rect width='10' height='6' fill='%23223'/></svg>", "published": True, "featured": True, "createdAt": 1700000000000, "screenshots": []},
  {"id": "game-b", "title": "Beta Blocks", "category": "Puzzle", "shortDescription": "Think.", "description": "Puzzle fun.", "url": "https://example.com/beta", "cover": "", "published": True, "featured": False, "createdAt": 1700000001000, "screenshots": []},
  {"id": "game-c", "title": "Hidden Draft", "category": "Other", "shortDescription": "", "description": "", "url": "", "cover": "", "published": False, "featured": False, "createdAt": 1700000002000, "screenshots": []},
]
FB_APP = "export const initializeApp=()=>({});"
FB_AUTH = """
const auth={currentUser:null};
const mk=()=>({email:'aanjorajeev@gmail.com',emailVerified:true,getIdToken:()=>fetch('http://localhost:5173/__token').then(r=>r.text()),getIdTokenResult:async()=>({claims:{email:'aanjorajeev@gmail.com',email_verified:true}})});
export const getAuth=()=>auth;
export const onAuthStateChanged=(a,cb)=>{if(localStorage.getItem('fake_admin')==='1')a.currentUser=mk();setTimeout(()=>cb(a.currentUser),30)};
export const signInWithEmailAndPassword=async(a)=>{localStorage.setItem('fake_admin','1');a.currentUser=mk();return{user:a.currentUser}};
export const signOut=async(a)=>{localStorage.removeItem('fake_admin');a.currentUser=null};
export const sendEmailVerification=async()=>{};export const sendPasswordResetEmail=async()=>{};
"""
FB_STORE = """
const DEFAULT=%s;
const cur=()=>JSON.parse(localStorage.getItem('fake_doc')||'null')||DEFAULT;
export const getFirestore=()=>({});
export const doc=(db,...p)=>({path:p.join('/')});
export const getDoc=async()=>({exists:()=>true,data:()=>cur()});
export const setDoc=async(ref,data)=>{const c=cur();localStorage.setItem('fake_doc',JSON.stringify({...c,games:data.games,settings:data.settings}))};
export const serverTimestamp=()=>({});
export const collection=()=>({});export const getDocs=async()=>({docs:[],forEach(){}});
export const addDoc=async()=>({});export const deleteDoc=async()=>{};export const query=()=>({});export const orderBy=()=>({});export const limit=()=>({});export const updateDoc=async()=>{};
""" % json.dumps({"games": GAMES, "settings": {"features": {"statsApiUrl": API}}})

def admin_token():
    return urllib.request.urlopen(BASE + "/__token").read().decode()

def api(method, path, body=None, admin=False, vid="e2e-helper-visitor-0001"):
    h = {"Content-Type": "application/json", "X-GV-Visitor": vid, "Origin": BASE}
    if admin: h["Authorization"] = "Bearer " + admin_token()
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return {"_status": e.code, **json.loads(e.read() or b"{}")}

def debug():
    return json.loads(urllib.request.urlopen(BASE + "/__debug").read())

def new_context(browser, mobile=False, admin=False, api_url=API, tablet=False):
    ctx = browser.new_context(viewport={"width": 390, "height": 844} if mobile else ({"width": 820, "height": 1100} if tablet else {"width": 1366, "height": 850}), is_mobile=mobile, has_touch=mobile, accept_downloads=True, user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
    def route(r):
        u = r.request.url
        if u.startswith("https://www.gstatic.com/firebasejs/"):
            body = FB_APP if "firebase-app" in u else FB_AUTH if "firebase-auth" in u else FB_STORE.replace(API, api_url)
            return r.fulfill(status=200, content_type="text/javascript", body=body, headers={"Access-Control-Allow-Origin": "*"})
        if u.startswith(BASE) or u.startswith(API) or u.startswith("data:"): return r.continue_()
        return r.abort()
    ctx.route("**/*", route)
    if admin: ctx.add_init_script("localStorage.setItem('fake_admin','1')")
    return ctx

def watch(page, errors):
    page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e) + " @ " + (getattr(e, "stack", "") or "")[:400].replace("\n", " | ")))
    page.on("console", lambda m: errors.append("CONSOLE: " + m.text) if m.type == "error" and "Failed to load resource" not in m.text and "net::ERR" not in m.text else None)
