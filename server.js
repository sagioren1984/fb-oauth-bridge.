import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// משתנים מהסביבה
const {
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  SERVER_BASE_URL,
  FRONTEND_URL,
  FB_API_VERSION = "v19.0",
} = process.env;

// ✅ הרשאות בסיסיות בלבד - חשוב!
const FB_SCOPES = "public_profile,email";

// ✅ URL של השרת שלך ב-Render (ככה זה נראה אצלך)
const REDIRECT_URI = "https://fb-oauth-bridge.onrender.com/api/oauth/facebook/callback";

// התחלת OAuth - שלב ראשון
app.get("/api/oauth/facebook/start", (_req, res) => {
  const u = new URL(`https://www.facebook.com/${FB_API_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", FACEBOOK_APP_ID);
  u.searchParams.set("redirect_uri", REDIRECT_URI);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", FB_SCOPES);
  return res.redirect(u.toString());
});

// זיכרון זמני (בפרודקשן שמרו בדאטהבייס)
let MEMORY = { userToken: null, longToken: null, profile: null };

// קאלבק אחרי ההרשאה
app.get("/api/oauth/facebook/callback", async (req, res) => {
  try {
    const { code, error, error_description } = req.query;
    if (error) return res.status(400).send(`OAuth error: ${error} - ${error_description}`);
    if (!code) return res.status(400).send("Missing code");

    // שלב 1: קבלת short-lived token
    const tokenUrl = new URL(`https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", FACEBOOK_APP_ID);
    tokenUrl.searchParams.set("client_secret", FACEBOOK_APP_SECRET);
    tokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) return res.status(400).send(`Token error: ${JSON.stringify(tokenData)}`);

    MEMORY.userToken = tokenData.access_token;

    // שלב 2: קבלת פרופיל המשתמש
    const meRes = await fetch(`https://graph.facebook.com/me?fields=id,name,picture,email&access_token=${MEMORY.userToken}`);
    MEMORY.profile = await meRes.json();

    // ✅ שלב 3: הפניה חזרה לאפליקציה שלך בלובייבל
    const back = new URL(FRONTEND_URL || "https://lovable.dev/");
    back.searchParams.set("connected", "true");
    back.searchParams.set("name", MEMORY?.profile?.name || "");
    back.searchParams.set("email", MEMORY?.profile?.email || "");
    return res.redirect(back.toString());
  } catch (e) {
    console.error("Callback error:", e);
    return res.status(500).send(`Callback error: ${e.message}`);
  }
});

// בדיקת מצב חיבור
app.get("/api/oauth/status", (_req, res) => {
  res.json({
    connected: !!MEMORY.userToken,
    profile: MEMORY.profile,
  });
});

// ברירת מחדל
app.get("/", (_req, res) => res.send("✅ Facebook OAuth Bridge is running. Use /api/oauth/facebook/start"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server running on port", PORT));
