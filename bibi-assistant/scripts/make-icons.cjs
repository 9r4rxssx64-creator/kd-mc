// Fabrique les icônes de Bibi (PWA) à partir de l'icône de l'abeille du dépôt, avec un vrai Chromium (canvas).
// Usage : node scripts/make-icons.cjs [source.png]
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");

const SOURCE = process.argv[2] || path.resolve(__dirname, "../../lingua/bee/icon-512.png");
const SORTIE = path.resolve(__dirname, "../public/icons");

const ICONES = [
  { nom: "icon-192.png", taille: 192, marge: 0 },
  { nom: "icon-512.png", taille: 512, marge: 0 },
  { nom: "icon-maskable-512.png", taille: 512, marge: 0.14, fond: "auto" }, // zone sûre des icônes « maskable »
  { nom: "apple-touch-icon.png", taille: 180, marge: 0, fond: "auto" }, // iOS n'accepte pas la transparence
];

(async () => {
  if (!fs.existsSync(SOURCE)) throw new Error(`Icône source introuvable : ${SOURCE}`);
  fs.mkdirSync(SORTIE, { recursive: true });
  const b64 = fs.readFileSync(SOURCE).toString("base64");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setContent("<canvas id=c></canvas>");
  for (const ic of ICONES) {
    const data = await page.evaluate(async ({ b64, ic }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.getElementById("c");
      c.width = c.height = ic.taille;
      const x = c.getContext("2d");
      x.clearRect(0, 0, ic.taille, ic.taille);
      if (ic.fond) {
        // le fond est la couleur du coin de l'image source : le carré de l'icône ne se voit plus
        const t = document.createElement("canvas"); t.width = t.height = 8;
        const tx = t.getContext("2d"); tx.drawImage(img, 0, 0, 8, 8);
        const [r, g, b] = tx.getImageData(0, 0, 1, 1).data;
        x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, ic.taille, ic.taille);
      }
      const m = Math.round(ic.taille * ic.marge);
      x.imageSmoothingQuality = "high";
      x.drawImage(img, m, m, ic.taille - 2 * m, ic.taille - 2 * m);
      return c.toDataURL("image/png").split(",")[1];
    }, { b64, ic });
    fs.writeFileSync(path.join(SORTIE, ic.nom), Buffer.from(data, "base64"));
    console.log(`✓ ${ic.nom} (${ic.taille}×${ic.taille})`);
  }
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
