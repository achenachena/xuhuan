import type { Character } from "@xuhuan/game-types";

type AnimationState = "idle" | "attack" | "damage" | "block" | "special" | "victory" | "defeat";

const parseColor = (hex: string): { r: number; g: number; b: number } => {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return { r, g, b };
};

const lightenColor = (hex: string, percent: number): string => {
  const { r, g, b } = parseColor(hex);
  const adjust = (value: number): number => Math.min(255, Math.round(value + (255 - value) * percent));
  const newR = adjust(r).toString(16).padStart(2, "0");
  const newG = adjust(g).toString(16).padStart(2, "0");
  const newB = adjust(b).toString(16).padStart(2, "0");
  return `#${newR}${newG}${newB}`;
};

const darkenColor = (hex: string, percent: number): string => {
  const { r, g, b } = parseColor(hex);
  const adjust = (value: number): number => Math.max(0, Math.round(value * (1 - percent)));
  const newR = adjust(r).toString(16).padStart(2, "0");
  const newG = adjust(g).toString(16).padStart(2, "0");
  const newB = adjust(b).toString(16).padStart(2, "0");
  return `#${newR}${newG}${newB}`;
};

const getArchetypePattern = (archetype: string): string => {
  switch (archetype) {
    case "idol":
      return `
        <circle cx="100" cy="80" r="15" fill="rgba(255, 255, 255, 0.3)" />
        <circle cx="180" cy="80" r="15" fill="rgba(255, 255, 255, 0.3)" />
        <path d="M 120 180 Q 140 200 160 180" stroke="rgba(255, 255, 255, 0.3)" stroke-width="3" fill="none" />
      `;
    case "gamer":
      return `
        <rect x="90" y="70" width="100" height="60" rx="10" fill="rgba(255, 255, 255, 0.2)" />
        <circle cx="110" cy="90" r="8" fill="rgba(255, 255, 255, 0.4)" />
        <circle cx="170" cy="90" r="8" fill="rgba(255, 255, 255, 0.4)" />
      `;
    case "seiso":
      return `
        <path d="M 140 50 L 150 80 L 140 80 Z" fill="rgba(255, 255, 255, 0.5)" />
        <circle cx="100" cy="90" r="12" fill="rgba(255, 255, 255, 0.3)" />
        <circle cx="180" cy="90" r="12" fill="rgba(255, 255, 255, 0.3)" />
      `;
    case "chaotic":
      return `
        <path d="M 80 80 L 120 120 M 120 80 L 80 120" stroke="rgba(255, 100, 100, 0.5)" stroke-width="4" />
        <path d="M 160 80 L 200 120 M 200 80 L 160 120" stroke="rgba(255, 100, 100, 0.5)" stroke-width="4" />
      `;
    case "apex-predator":
      return `
        <path d="M 90 80 L 110 100 L 90 100 Z" fill="rgba(150, 0, 150, 0.4)" />
        <path d="M 170 80 L 190 100 L 170 100 Z" fill="rgba(150, 0, 150, 0.4)" />
        <path d="M 100 180 L 140 200 L 180 180" stroke="rgba(150, 0, 150, 0.4)" stroke-width="3" fill="none" />
      `;
    case "artist":
      return `
        <circle cx="100" cy="90" r="10" fill="rgba(255, 223, 0, 0.4)" />
        <circle cx="180" cy="90" r="10" fill="rgba(255, 223, 0, 0.4)" />
        <path d="M 60 120 Q 140 140 220 120" stroke="rgba(255, 223, 0, 0.3)" stroke-width="2" fill="none" />
      `;
    default:
      return "";
  }
};

const getAnimationTransform = (state: AnimationState): string => {
  switch (state) {
    case "attack":
      return "translate(5, 0)";
    case "damage":
      return "translate(-5, 0)";
    case "block":
      return "scale(0.95)";
    case "special":
      return "scale(1.1)";
    case "victory":
      return "translate(0, -10)";
    case "defeat":
      return "translate(0, 20) rotate(15)";
    case "idle":
    default:
      return "translate(0, 0)";
  }
};

export const generateCharacterAvatar = (
  character: Character,
  state: AnimationState = "idle",
  size: number = 280
): string => {
  const primaryColor = character.colorTheme;
  const lightColor = lightenColor(primaryColor, 0.3);
  const darkColor = darkenColor(primaryColor, 0.3);
  const pattern = getArchetypePattern(character.vtuberArchetype);
  const transform = getAnimationTransform(state);

  // Animation glow for special state
  const glowOpacity = state === "special" ? 0.6 : 0;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 320" width="${size}" height="${size * 320/280}">
      <defs>
        <linearGradient id="bodyGradient-${character.id}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${lightColor}" />
          <stop offset="50%" stop-color="${primaryColor}" />
          <stop offset="100%" stop-color="${darkColor}" />
        </linearGradient>
        <filter id="glow-${character.id}">
          <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <radialGradient id="specialGlow-${character.id}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${primaryColor}" stop-opacity="${glowOpacity}" />
          <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- Special glow effect -->
      <circle cx="140" cy="160" r="150" fill="url(#specialGlow-${character.id})" opacity="${glowOpacity}" />

      <!-- Main character group with animation transform -->
      <g transform="${transform}" transform-origin="140 160">
        <!-- Body -->
        <ellipse cx="140" cy="200" rx="60" ry="80" fill="url(#bodyGradient-${character.id})" filter="url(#glow-${character.id})" />

        <!-- Head -->
        <circle cx="140" cy="120" r="50" fill="${lightColor}" filter="url(#glow-${character.id})" />

        <!-- Hair/Details based on archetype -->
        ${pattern}

        <!-- Arms -->
        <ellipse cx="90" cy="180" rx="15" ry="40" fill="${primaryColor}" opacity="0.8" />
        <ellipse cx="190" cy="180" rx="15" ry="40" fill="${primaryColor}" opacity="0.8" />

        <!-- Shadow -->
        <ellipse cx="140" cy="290" rx="70" ry="10" fill="rgba(0, 0, 0, 0.2)" />
      </g>

      <!-- Name label -->
      <rect x="10" y="290" width="260" height="25" rx="5" fill="rgba(0, 0, 0, 0.6)" />
      <text x="140" y="307" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="${lightColor}" text-anchor="middle">
        ${character.name}
      </text>
    </svg>
  `.trim();
};

export const generateCharacterPortrait = (character: Character, size: number = 120): string => {
  const primaryColor = character.colorTheme;
  const lightColor = lightenColor(primaryColor, 0.3);
  const darkColor = darkenColor(primaryColor, 0.3);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}">
      <defs>
        <linearGradient id="portraitGradient-${character.id}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${lightColor}" />
          <stop offset="100%" stop-color="${darkColor}" />
        </linearGradient>
        <radialGradient id="portraitGlow-${character.id}" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stop-color="${primaryColor}" stop-opacity="0" />
          <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0.3" />
        </radialGradient>
      </defs>

      <!-- Background circle -->
      <circle cx="60" cy="60" r="60" fill="url(#portraitGradient-${character.id})" />
      <circle cx="60" cy="60" r="60" fill="url(#portraitGlow-${character.id})" />

      <!-- Face -->
      <circle cx="60" cy="55" r="35" fill="${lightColor}" />

      <!-- Simple facial features based on archetype -->
      ${character.vtuberArchetype === "idol" ? `
        <circle cx="50" cy="50" r="4" fill="${darkColor}" />
        <circle cx="70" cy="50" r="4" fill="${darkColor}" />
        <path d="M 50 65 Q 60 70 70 65" stroke="${darkColor}" stroke-width="2" fill="none" />
      ` : character.vtuberArchetype === "chaotic" ? `
        <path d="M 45 50 L 55 50" stroke="${darkColor}" stroke-width="2" />
        <path d="M 65 50 L 75 50" stroke="${darkColor}" stroke-width="2" />
        <path d="M 50 65 Q 60 60 70 65" stroke="${darkColor}" stroke-width="2" fill="none" />
      ` : `
        <circle cx="50" cy="50" r="3" fill="${darkColor}" />
        <circle cx="70" cy="50" r="3" fill="${darkColor}" />
        <line x1="50" y1="65" x2="70" y2="65" stroke="${darkColor}" stroke-width="1.5" />
      `}

      <!-- Border -->
      <circle cx="60" cy="60" r="58" fill="none" stroke="${darkColor}" stroke-width="2" opacity="0.5" />
    </svg>
  `.trim();
};

export const avatarToDataUrl = (svgString: string): string => {
  const encoded = encodeURIComponent(svgString)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml,${encoded}`;
};
