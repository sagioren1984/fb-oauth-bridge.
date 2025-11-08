import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
const app = express();
app.use(express.json());
// לאפשר קריאה מה-UI שלך בלובייבל
const {
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  SERVER_BASE_URL,
  FRONTEND_URL,
  FB_API_VERSION = "v19.0",
  FB_SCOPES = "public_profile,email,pages_read_engagement,pages_read_user_content,pages_manage_posts,instagram_basic",
} = process.env;

const REDIRECT_URI = "https://fb-oauth-bridge.onrender.com/api/oauth/facebook/callback";


// 1) התחלת OAuth
app.get("/api/oauth/facebook/start", (_req, res) => {
  const u = new URL(`https://www.facebook.com/${FB_API_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", FACEBOOK_APP_ID);
  u.searchParams.set("redirect_uri", REDIRECT_URI);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", FB_SCOPES);
  return res.redirect(u.toString());
});

// זיכרון דמו (בפרודקשן שמרו בדאטהבייס)
let MEMORY = { userToken: null, longToken: null, profile: null, pages: [] };

// 2) קאלבק: מחליפים code ל-token ומושכים פרופיל + עמודים
app.get("/api/oauth/facebook/callback", async (req, res) => {
  try {
    const { code, error, error_description } = req.query;
    if (error) return res.status(400).send(`OAuth error: ${error} - ${error_description}`);
    if (!code) return res.status(400).send("Missing code");
    // short-lived user token
    const t = new URL(`https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`);
    t.searchParams.set("client_id", FACEBOOK_APP_ID);
    t.searchParams.set("client_secret", FACEBOOK_APP_SECRET);
    t.searchParams.set("redirect_uri", REDIRECT_URI);
    t.searchParams.set("code", code);
    const tr = await fetch(t);
    const td = await tr.json();
    if (!tr.ok) return res.status(400).send(`Token error: ${JSON.stringify(td)}`);
    MEMORY.userToken = td.access_token;
    // long-lived token (מומלץ)
    const ll = new URL(`https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`);
    ll.searchParams.set("grant_type", "fb_exchange_token");
    ll.searchParams.set("client_id", FACEBOOK_APP_ID);
    ll.searchParams.set("client_secret", FACEBOOK_APP_SECRET);
    ll.searchParams.set("fb_exchange_token", MEMORY.userToken);
    const lr = await fetch(ll);
    const ld = await lr.json();
    MEMORY.longToken = ld.access_token || MEMORY.userToken;
    // פרופיל
    const meR = await fetch(`https://graph.facebook.com/me?fields=id,name,picture&access_token=${MEMORY.longToken}`);
    MEMORY.profile = await meR.json();
    // עמודים מנוהלים + page access tokens
    const pgR = await fetch(`https://graph.facebook.com/me/accounts?access_token=${MEMORY.longToken}`);
    const pgJ = await pgR.json();
    MEMORY.pages = Array.isArray(pgJ.data) ? pgJ.data : [];
    // חזרה ל-UI שלך
    const back = new URL(FE || "/");
    back.searchParams.set("connected", "true");
    back.searchParams.set("name", MEMORY?.profile?.name || "");
    return res.redirect(back.toString());
  } catch (e) {
    return res.status(500).send(`Callback error: ${e.message}`);
  }
});

// מצב חיבור
app.get("/api/oauth/status", (_req, res) => {
  res.json({
    connected: !!MEMORY.longToken,
    profile: MEMORY.profile,
    pages: MEMORY.pages.map(p => ({ id: p.id, name: p.name }))
  });
});

// פוסטים של עמוד (צריך לבחור pageId מרשימת pages)
app.get("/api/meta/posts", async (req, res) => {
  try {
    const { pageId } = req.query;
    if (!pageId) return res.status(400).json({ error: "Missing pageId" });
    const page = MEMORY.pages.find(p => p.id === pageId);
    if (!page) return res.status(404).json({ error: "Page not connected" });
    const r = await fetch(`https://graph.facebook.com/${pageId}/posts?limit=10&access_token=${page.access_token}`);
    const j = await r.json();
    res.json({ posts: j.data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/", (_req, res) => res.send("OK: use /api/oauth/facebook/start"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server on", PORT));
