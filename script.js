const header = document.querySelector("[data-header]");
const menuButton = document.querySelector("[data-menu-button]");
const navLinks = Array.from(document.querySelectorAll(".nav-links a"));
const crispTriggers = Array.from(document.querySelectorAll("[data-crisp-trigger]"));
const crispWebsiteId = document.querySelector('meta[name="crisp-website-id"]')?.content.trim() || "";
const crispEnabled = Boolean(crispWebsiteId);

function setMenu(open) {
  if (!header || !menuButton) return;
  header.classList.toggle("is-open", open);
  document.body.classList.toggle("menu-open", open);
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "关闭导航" : "打开导航");
}

function loadCrispChat() {
  if (!crispEnabled || window.CRISP_WEBSITE_ID) return;

  window.$crisp = window.$crisp || [];
  window.CRISP_WEBSITE_ID = crispWebsiteId;
  window.CRISP_RUNTIME_CONFIG = { locale: "zh" };
  window.$crisp.push(["set", "session:data", [[["source", "qfj-vip-landing"]]]]);
  window.$crisp.push(["set", "message:text", ["你好，我想了解青峰见财讯VIP服务。"]]);

  const script = document.createElement("script");
  script.src = "https://client.crisp.chat/l.js";
  script.async = true;
  document.head.appendChild(script);
}

function openCrispChat() {
  if (!crispEnabled) return;
  loadCrispChat();
  window.$crisp.push(["do", "chat:show"]);
  window.$crisp.push(["do", "chat:open"]);
}

menuButton?.addEventListener("click", () => {
  setMenu(!header.classList.contains("is-open"));
});

crispTriggers.forEach((trigger) => {
  trigger.addEventListener("click", openCrispChat);
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => setMenu(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenu(false);
  }
});

loadCrispChat();

const copyButtons = Array.from(document.querySelectorAll("[data-copy]"));

async function copyText(value) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "-1000px";
  document.body.appendChild(field);
  field.select();
  document.execCommand("copy");
  field.remove();
}

copyButtons.forEach((button) => {
  const originalText = button.textContent;
  button.addEventListener("click", async () => {
    const value = button.getAttribute("data-copy") || "";
    try {
      await copyText(value);
      button.textContent = "已复制";
      button.classList.add("is-copied");
      window.setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove("is-copied");
      }, 1400);
    } catch {
      button.textContent = value;
      button.classList.add("is-copied");
    }
  });
});

const sections = Array.from(document.querySelectorAll("main section[id]"));
const hero = document.querySelector(".hero");
const mobileCta = document.querySelector(".mobile-cta");

function updateMobileCta() {
  if (!hero || !mobileCta) return;
  const threshold = hero.offsetHeight * 0.72;
  mobileCta.classList.toggle("is-visible", window.scrollY > threshold);
}

window.addEventListener("scroll", updateMobileCta, { passive: true });
window.addEventListener("resize", updateMobileCta);
updateMobileCta();

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => {
          link.classList.toggle("is-active", link.getAttribute("href") === `#${entry.target.id}`);
        });
      });
    },
    { rootMargin: "-40% 0px -52% 0px", threshold: 0 }
  );

  sections.forEach((section) => observer.observe(section));
}

const canvas = document.getElementById("marketCanvas");
const ctx = canvas?.getContext("2d");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
let animationFrame = 0;
let width = 0;
let height = 0;
let dpr = 1;

function getMarketPalette() {
  if (colorScheme.matches) {
    return {
      background: "#0f1116",
      grid: "rgba(255, 255, 255, 0.055)",
      positiveBar: "rgba(52, 211, 153, 0.13)",
      negativeBar: "rgba(255, 80, 63, 0.13)",
      accentDot: "rgba(255, 80, 63, 0.24)",
      neutralDot: "rgba(255, 255, 255, 0.16)",
      accentCurve: "rgba(255, 80, 63, 0.5)",
      neutralCurve: "rgba(255, 255, 255, 0.2)",
      goldCurve: "rgba(227, 168, 74, 0.26)",
    };
  }

  return {
    background: "#f5f1ea",
    grid: "rgba(16, 17, 20, 0.06)",
    positiveBar: "rgba(14, 159, 110, 0.13)",
    negativeBar: "rgba(255, 45, 27, 0.13)",
    accentDot: "rgba(255, 45, 27, 0.22)",
    neutralDot: "rgba(16, 17, 20, 0.16)",
    accentCurve: "rgba(255, 45, 27, 0.44)",
    neutralCurve: "rgba(16, 17, 20, 0.22)",
    goldCurve: "rgba(201, 132, 32, 0.24)",
  };
}

function resizeCanvas() {
  if (!canvas || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.max(1, Math.floor(rect.width));
  height = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawGrid() {
  if (!ctx) return;
  const palette = getMarketPalette();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  const grid = Math.max(38, Math.min(72, width / 8));
  ctx.lineWidth = 1;
  ctx.strokeStyle = palette.grid;

  for (let x = -grid; x < width + grid; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = -grid; y < height + grid; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawCurve(color, base, amplitude, speed, phase, time, lineWidth) {
  if (!ctx) return;
  ctx.beginPath();
  for (let i = 0; i <= 90; i += 1) {
    const x = (i / 90) * width;
    const wave = Math.sin(i * 0.18 + time * speed + phase) * amplitude;
    const waveTwo = Math.cos(i * 0.07 + phase * 2) * amplitude * 0.45;
    const trend = (i / 90 - 0.5) * amplitude * 0.85;
    const y = base + wave + waveTwo - trend;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawBars(time) {
  if (!ctx) return;
  const palette = getMarketPalette();
  const count = width < 620 ? 12 : 20;
  const gap = width / (count + 2);
  const baseY = height * 0.78;

  for (let i = 0; i < count; i += 1) {
    const x = gap * (i + 1);
    const h = 32 + Math.sin(time * 0.0016 + i * 0.9) * 18 + (i % 5) * 5;
    const positive = i % 4 !== 1;
    ctx.fillStyle = positive ? palette.positiveBar : palette.negativeBar;
    ctx.fillRect(x, baseY - h, Math.max(8, gap * 0.34), h);
  }
}

function drawTickerDots(time) {
  if (!ctx) return;
  const palette = getMarketPalette();
  const dots = width < 700 ? 8 : 14;
  for (let i = 0; i < dots; i += 1) {
    const x = ((i * 173 + time * 0.012) % (width + 160)) - 80;
    const y = height * (0.18 + ((i * 29) % 58) / 100);
    const r = 2 + (i % 3);
    ctx.beginPath();
    ctx.fillStyle = i % 3 === 0 ? palette.accentDot : palette.neutralDot;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFrame(time = 0) {
  if (!ctx || !canvas) return;
  const palette = getMarketPalette();
  drawGrid();
  drawBars(time);
  drawTickerDots(time);

  const center = width < 700 ? 0.48 : 0.52;
  drawCurve(palette.accentCurve, height * center, height * 0.048, 0.0012, 0, time, 3);
  drawCurve(palette.neutralCurve, height * (center + 0.1), height * 0.034, 0.0016, 2.1, time, 2);
  drawCurve(palette.goldCurve, height * (center - 0.12), height * 0.03, 0.001, 4.2, time, 2);

  if (!reducedMotion.matches) {
    animationFrame = window.requestAnimationFrame(drawFrame);
  }
}

if (canvas && ctx) {
  const restartFrame = () => {
    window.cancelAnimationFrame(animationFrame);
    resizeCanvas();
    drawFrame();
  };

  restartFrame();
  window.addEventListener("resize", restartFrame);
  if (colorScheme.addEventListener) {
    colorScheme.addEventListener("change", restartFrame);
  } else {
    colorScheme.addListener(restartFrame);
  }
}
