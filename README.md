# GAMEVERSE

A responsive gaming directory and launcher starter project.

## What's included

- First-visit community unlock screen (tasks with empty links are hidden).
- Permanent browser unlock using `localStorage`.
- Homepage, game library, individual game pages and contact page.
- Preloaded GTA game listings and supplied external URLs.
- Admin dashboard at `#admin` / `/admin`-style hash route.
- Email-only admin login restricted to `aanjorajeev@gmail.com`.
- Add/edit/delete/publish games, community settings, homepage settings, contact settings and ad settings.
- Firebase Authentication and Firestore integration (Spark plan friendly — Firebase Storage is **not** used).
- Firestore security rules.
- Professional image upload, crop & positioning editor (see *Image management* below).

## Important limitations / setup

This is a complete starter implementation, but **cloud administration is not active until you configure Firebase**. The public site can be previewed without Firebase; the admin panel will show setup instructions until Firebase is configured.

The initial admin account is not created by this project. Create it yourself in Firebase Authentication for the exact authorized email, enable email verification, verify that email, and use the password you choose. There is no username and no default password.

### 1. Create Firebase project

1. Create a project at https://console.firebase.google.com/
2. Add a Web App and copy its Firebase web configuration.
3. Enable Authentication → Sign-in method → Email/Password.
4. Create the user `aanjorajeev@gmail.com` in Authentication.
5. Verify the email address.
6. Enable Cloud Firestore.
7. Paste the web configuration into `firebase-config.js`.
8. Keep `ADMIN_EMAIL` as `aanjorajeev@gmail.com`.
9. Publish `firestore.rules` in Firestore Rules.

Do not create any other admin accounts. The email allowlist is also enforced by the supplied Firestore rules. (`storage.rules` is kept only for reference; Firebase Storage is not used.)

### 2. Run locally

Because this project uses JavaScript modules, do not open `index.html` directly with `file://`.

Install Node.js, then open a terminal in this folder and run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).

### 3. Build for deployment

```bash
npm run build
npm run preview
```

Deploy the generated `dist` folder to an HTTPS static host such as Firebase Hosting or Netlify. For Firebase Hosting, configure SPA fallback to `/index.html`.

### 4. Admin access

Open:

- Local: `http://localhost:5173/#admin`
- Published: `https://YOUR-DOMAIN/#admin`

Sign in with the verified email `aanjorajeev@gmail.com` and the password you created in Firebase Authentication. There is no username.

### 5. Image management (admin only)

Admin → **Manage games → Edit/Add** (cover, logo, screenshots), **Homepage settings** (hero background) and **Image library & hosting** (other website images).

**How images are stored.** The original image is uploaded once to an image host (Cloudinary, free plan). Firestore stores only the image URL plus a small JSON "fit" object (source, crop box, zoom, horizontal/vertical position, aspect ratio, rotation, display mode). No Base64, no Firebase Storage. Images are selected from your computer and cropped in the editor; the admin UI does not accept pasted image URLs.

**One-time host setup (2 minutes).**
1. Create a free Cloudinary account and copy the *Cloud name*.
2. Settings → Upload → *Add upload preset* → **Signing mode: Unsigned**. Leave transformations empty so originals (incl. transparent PNG/WebP) are kept.
3. Admin → *Image library & hosting* → paste cloud name + preset → save. (Or set defaults in `firebase-config.js` → `IMAGE_HOST`.)

No secret key is ever placed in the website. Because the preset is unsigned, treat the preset name as semi-public; you can restrict allowed formats/size and enable moderation inside Cloudinary.

**Editor.** JPG/JPEG/PNG/WebP. Drag the crop box, drag corners to resize, mouse wheel / sliders to zoom, horizontal & vertical position sliders, rotate left/right, centre, reset, before/after, live previews (game card, featured section, game page, mobile).
- *Covers*: 16:9 landscape, centred by default, optional custom crop.
- *Logos*: **contain** mode by default (never stretched or cut), adjustable size and independent x/y position, optional trim; transparent PNG/WebP preserved.
- *Hero*: focal point + zoom with desktop and mobile previews.
- *Screenshots*: individually cropped to one consistent gallery ratio; reorder/replace/delete.

The website and the editor preview use the same renderer (`image-editor.js`), so what you see is what visitors get. Crop settings are non-destructive: the original is never altered, you can re-open and change the crop at any time.

**Permissions.** The editor only opens for the signed-in, email-verified `aanjorajeev@gmail.com`; the token is re-checked before opening, before uploading and before every Firestore write, and the Firestore rules enforce it on the server. Visitors cannot modify images.

**Deleting.** Removing an image removes it from GAMEVERSE. Unsigned uploads cannot be deleted from a browser, so delete the file in your Cloudinary dashboard if you want it gone from the host.

### 6. Ads

Advertisements are disabled by default. The settings screen stores ad configuration but deliberately does not execute arbitrary pasted ad HTML/JavaScript. Add a reviewed integration for your approved ad network only after the website is eligible and approved. Never use forced redirects or deceptive placements.

## Notes

- The task checkboxes are manual confirmations, not proof of YouTube subscription, likes, comments or Discord membership.
- Unlock is browser-local and can reset if browser data is cleared or the visitor changes devices.
- External games open in a new tab. Many third-party sites block iframe embedding.
- GAMEVERSE is an independent directory and is not affiliated with Rockstar Games.
- Replace the starter Privacy Policy and Terms text with complete, accurate legal pages before public launch.


## Advertising manager

The admin dashboard includes two separate advertising options:

- **Google AdSense:** after Google approves the live website, enter the `ca-pub-...` publisher ID and the numeric ad slot IDs generated by AdSense. Confirm site approval before enabling. The app loads the official AdSense library and renders responsive units only in configured placements.
- **Direct sponsored campaigns:** upload sponsor banner images through **Admin → Image Library & Hosting**, then create a campaign in **Admin → Advertisement Settings**. Choose a banner from the media library, destination URL, placement and optional dates. Live campaigns are labelled **Sponsored** and links use `rel="sponsored nofollow"`.

Advertising is disabled by default. Do not enable Google ads until the domain is approved by AdSense and your privacy/cookie disclosures are ready. The app does not accept arbitrary ad scripts in the admin panel.
