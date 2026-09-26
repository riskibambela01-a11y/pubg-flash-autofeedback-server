function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function validSecret(received, expected) {
  if (
    !received ||
    !expected ||
    typeof received !== "string" ||
    typeof expected !== "string"
  ) {
    return false;
  }

  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  if (a.length !== b.length) {
    return false;
  }

  return require("node:crypto").timingSafeEqual(a, b);
}

function json(res, status, body) {
  res.status(status).setHeader(
    "Content-Type",
    "application/json"
  );

  return res.end(JSON.stringify(body));
}

// ========================================
// MASK NICKNAME
// 3 HURUF AWAL + 7 BINTANG + 1 HURUF AKHIR
// ========================================
function maskNickname(value) {
  const nickname = String(value ?? "")
    .replace(/[\r\n\t]/g, "")
    .trim();

  if (!nickname) {
    return "***********";
  }

  if (nickname.length <= 4) {
    return nickname + "*******";
  }

  return (
    nickname.slice(0, 3) +
    "*******" +
    nickname.slice(-1)
  );
}

// ========================================
// MASK UID
// 3 DIGIT AWAL + BINTANG + 2 DIGIT AKHIR
// ========================================
function maskUid(value) {
  const uid = String(value ?? "").trim();

  if (!uid) {
    return "******";
  }

  if (uid.length <= 5) {
    return "*".repeat(uid.length);
  }

  return (
    uid.slice(0, 3) +
    "*".repeat(uid.length - 5) +
    uid.slice(-2)
  );
}

export default async function handler(req, res) {

  // ========================================
  // METHOD
  // ========================================
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return json(res, 405, {
      ok: false,
      error: "method_not_allowed"
    });
  }

  // ========================================
  // ENVIRONMENT
  // ========================================
  const expectedKey = process.env.AFB_SECRET_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!expectedKey || !botToken || !chatId) {
    return json(res, 500, {
      ok: false,
      error: "server_not_configured"
    });
  }

  // ========================================
  // READ JSON BODY
  // ========================================
  let data;

  try {
    data =
      typeof req.body === "object"
        ? req.body
        : JSON.parse(req.body || "{}");
  } catch {
    return json(res, 400, {
      ok: false,
      error: "invalid_json"
    });
  }

  // ========================================
  // CHECK SECRET KEY
  // ========================================
  if (!validSecret(data.key, expectedKey)) {
    return json(res, 401, {
      ok: false,
      error: "invalid_key"
    });
  }

  // ========================================
  // REQUIRED DATA
  // ========================================
  const required = [
    "uid",
    "playerName",
    "kills",
    "rank",
    "time",
    "photoBase64"
  ];

  for (const field of required) {
    if (
      typeof data[field] !== "string" ||
      !data[field].trim()
    ) {
      return json(res, 400, {
        ok: false,
        error: `missing_${field}`
      });
    }
  }

  // ========================================
  // PHOTO BASE64
  // ========================================
  const rawBase64 = data.photoBase64.replace(
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
    ""
  );

  let image;

  try {
    image = Buffer.from(rawBase64, "base64");
  } catch {
    return json(res, 400, {
      ok: false,
      error: "invalid_photo"
    });
  }

  // ========================================
  // PHOTO SIZE LIMIT
  // ========================================
  if (image.length < 500 || image.length > 3500000) {
    return json(res, 413, {
      ok: false,
      error: "photo_too_large_or_empty"
    });
  }

  // ========================================
  // MASK DATA
  // ========================================
  const maskedNickname = maskNickname(data.playerName);
  const maskedUid = maskUid(data.uid);

  // ========================================
  // PUBG VERSION
  // ========================================
  const pubgVersion =
    String(data.pubgVersion || "").trim() ||
    "Tidak diketahui";

  // Ikon/flag berdasarkan region yang sudah dideteksi Lua.
  // Tidak mengubah hasil deteksi; hanya menambahkan ikon di caption.
  function pubgRegionIcon(value) {
    const v = String(value || "").toLowerCase();

    if (v.includes("bgmi") || v.includes("india")) return "🇮🇳";
    if (v.includes("korea") || v.includes("kr")) return "🇰🇷";
    if (v.includes("vietnam") || v.includes("vn")) return "🇻🇳";
    if (v.includes("taiwan") || v.includes("tw")) return "🇹🇼";
    if (v.includes("global")) return "🌐";

    return "🎮";
  }

  const pubgDisplay =
    pubgRegionIcon(pubgVersion) + " " + pubgVersion;

  // ========================================
  // TELEGRAM CAPTION
  // ========================================
  const caption =
    "╔═══━━━─── • ───━━━═══╗\n" +
    "      𓆩 🏆 𓆪 ◀ B A N ▶ 𓆩 🏆 𓆪\n" +
    "        𖤐 AUTO FEEDBACK 𖤐\n" +
    "╚═══━━━─── • ───━━━═══╝\n" +
    "🏆PUBG FLASH 🏆\n" +
    "🔥 AUTO FEEDBACK 🔥\n" +
    "🦠 Bahan: PUBGM-FLASH V1\n" +
    htmlEscape(pubgDisplay) +
    "\n" +
    "👤 Nickname: " +
    htmlEscape(maskedNickname) +
    "\n" +
    "🔑 UID: " +
    htmlEscape(maskedUid) +
    "\n" +
    "🔫 Count Kill: " +
    htmlEscape(data.kills) +
    "\n" +
    "🏅 Rank: " +
    htmlEscape(data.rank) +
    "\n" +
    "⏱ Time: " +
    htmlEscape(data.time) +
    "\n\n" +
    "👑 Owner: @riskibambela";

  // ========================================
  // TELEGRAM FORM
  // ========================================
  const form = new FormData();

  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");

  form.append(
    "photo",
    new Blob(
      [image],
      {
        type: data.photoMimeType || "image/jpeg"
      }
    ),
    data.photoFilename || "win.jpg"
  );

  // ========================================
  // SEND PHOTO TO TELEGRAM
  // ========================================
  let telegramResponse;

  try {
    telegramResponse = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendPhoto`,
      {
        method: "POST",
        body: form
      }
    );
  } catch {
    return json(res, 502, {
      ok: false,
      error: "telegram_network_error"
    });
  }

  // ========================================
  // TELEGRAM RESPONSE
  // ========================================
  let telegramData = {};

  try {
    telegramData = await telegramResponse.json();
  } catch {}

  if (
    !telegramResponse.ok ||
    !telegramData.ok
  ) {
    return json(res, 502, {
      ok: false,
      error: "telegram_error"
    });
  }

  // ========================================
  // SUCCESS
  // ========================================
  return json(res, 200, {
    ok: true,
    message_id:
      telegramData.result?.message_id ?? null
  });
  }
