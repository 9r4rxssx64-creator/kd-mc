// Bibi, la petite abeille : un personnage SVG léger, animé en CSS (aucune image, aucune bibliothèque).
import type { BibiState } from "../lib/types";
import "../styles/bibi.css";

export const ETATS: { id: BibiState; libelle: string }[] = [
  { id: "rest", libelle: "Au repos" },
  { id: "waiting", libelle: "Elle attend" },
  { id: "listening", libelle: "Elle écoute" },
  { id: "thinking", libelle: "Elle réfléchit" },
  { id: "speaking", libelle: "Elle parle" },
  { id: "happy", libelle: "Contente" },
  { id: "surprised", libelle: "Surprise" },
  { id: "sad", libelle: "Triste" },
  { id: "error", libelle: "Un souci" },
  { id: "sleep", libelle: "Elle dort" },
];

export const libelleEtat = (e: BibiState): string => ETATS.find((x) => x.id === e)?.libelle ?? "";

function Yeux({ etat }: { etat: BibiState }) {
  if (etat === "sleep") {
    return <g className="yeux fermes"><path d="M74 88 Q84 95 94 88" /><path d="M106 88 Q116 95 126 88" /></g>;
  }
  if (etat === "happy") {
    return <g className="yeux fermes"><path d="M74 90 Q84 78 94 90" /><path d="M106 90 Q116 78 126 90" /></g>;
  }
  if (etat === "error") {
    return (
      <g className="yeux croix">
        <path d="M76 80 l16 16 M92 80 l-16 16" /><path d="M108 80 l16 16 M124 80 l-16 16" />
      </g>
    );
  }
  const grand = etat === "surprised";
  const r = grand ? 14 : 11;
  const p = grand ? 5 : 6.5;
  const regard = etat === "thinking" ? "haut" : etat === "waiting" ? "balaie" : etat === "sad" ? "bas" : "droit";
  return (
    <g className={`yeux ouverts ${regard}`}>
      <g className="oeil"><circle cx="84" cy="86" r={r} className="blanc" /><g className="pupille"><circle cx="84" cy="86" r={p} className="noir" /><circle cx="86.5" cy="83" r="2" className="reflet" /></g></g>
      <g className="oeil"><circle cx="116" cy="86" r={r} className="blanc" /><g className="pupille"><circle cx="116" cy="86" r={p} className="noir" /><circle cx="118.5" cy="83" r="2" className="reflet" /></g></g>
      {etat === "sad" && <><path className="sourcil" d="M72 72 L94 78" /><path className="sourcil" d="M128 72 L106 78" /></>}
    </g>
  );
}

function Bouche({ etat }: { etat: BibiState }) {
  switch (etat) {
    case "speaking": return <ellipse className="bouche parle" cx="100" cy="104" rx="8" ry="5.5" />;
    case "surprised": return <circle className="bouche o" cx="100" cy="106" r="5.5" />;
    case "sad": return <path className="bouche triste" d="M91 108 Q100 100 109 108" />;
    case "error": return <path className="bouche ondule" d="M89 104 l5 -4 l6 8 l6 -8 l5 4" />;
    case "happy": return <path className="bouche joie" d="M88 98 Q100 120 112 98 Z" />;
    case "thinking": return <path className="bouche pense" d="M94 104 L108 102" />;
    case "sleep": return <path className="bouche dort" d="M95 104 Q100 107 105 104" />;
    default: return <path className="bouche sourit" d="M92 100 Q100 108 108 100" />;
  }
}

export interface BibiProps {
  state: BibiState;
  size?: number;
  /** Texte lu par les lecteurs d'écran. */
  label?: string;
  onClick?: () => void;
}

export function Bibi({ state, size = 160, label, onClick }: BibiProps) {
  const contenu = (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={label ?? `Bibi — ${libelleEtat(state)}`} focusable="false">
      <defs>
        <clipPath id="bibi-corps"><ellipse cx="100" cy="138" rx="46" ry="40" /></clipPath>
      </defs>
      <ellipse className="ombre" cx="100" cy="188" rx="34" ry="6" />
      <g className="flotte">
        <g className="aile gauche"><ellipse cx="64" cy="82" rx="26" ry="42" transform="rotate(-28 64 82)" /></g>
        <g className="aile droite"><ellipse cx="136" cy="82" rx="26" ry="42" transform="rotate(28 136 82)" /></g>

        <g className="jambes"><path d="M84 174 l-6 10 M100 177 l0 11 M116 174 l6 10" /></g>
        <path className="dard" d="M95 176 L105 176 L100 190 Z" />
        <ellipse className="corps" cx="100" cy="138" rx="46" ry="40" />
        <g clipPath="url(#bibi-corps)"><rect className="rayure" x="40" y="126" width="120" height="13" /><rect className="rayure" x="40" y="148" width="120" height="13" /></g>
        <g className="bras gauche"><ellipse cx="57" cy="136" rx="7" ry="10" transform="rotate(20 57 136)" /></g>
        <g className="bras droit"><ellipse cx="143" cy="136" rx="7" ry="10" transform="rotate(-20 143 136)" /></g>

        <g className="tete">
          <g className="antenne gauche"><path d="M86 52 Q74 34 68 22" /><circle cx="68" cy="21" r="5" /></g>
          <g className="antenne droite"><path d="M114 52 Q126 34 132 22" /><circle cx="132" cy="21" r="5" /></g>
          <circle className="visage" cx="100" cy="86" r="42" />
          <Yeux etat={state} />
          <circle className="joue" cx="70" cy="101" r="6.5" /><circle className="joue" cx="130" cy="101" r="6.5" />
          <Bouche etat={state} />
        </g>

        {state === "listening" && <g className="onde-ecoute"><circle cx="100" cy="86" r="52" /><circle cx="100" cy="86" r="52" className="deux" /></g>}
        {state === "speaking" && <g className="sons"><path d="M150 76 q10 10 0 20" /><path d="M158 68 q16 18 0 36" /></g>}
        {state === "thinking" && <g className="bulle"><circle cx="150" cy="44" r="3.5" /><circle cx="160" cy="34" r="5" /><circle cx="174" cy="22" r="7" /></g>}
        {state === "sleep" && <g className="zzz"><text x="146" y="52">z</text><text x="160" y="36">Z</text></g>}
        {state === "error" && <g className="alerte"><circle cx="156" cy="46" r="13" /><text x="156" y="52" textAnchor="middle">!</text></g>}
        {state === "sad" && <path className="larme" d="M72 100 q-4 9 0 12 q4 -3 0 -12 Z" />}
      </g>
    </svg>
  );
  return (
    <div className="bibi" data-state={state} style={{ width: size, height: size }} data-testid="bibi">
      {onClick ? <button type="button" className="bibi-btn" onClick={onClick} aria-label={label ?? `Bibi — ${libelleEtat(state)}`}>{contenu}</button> : contenu}
    </div>
  );
}
