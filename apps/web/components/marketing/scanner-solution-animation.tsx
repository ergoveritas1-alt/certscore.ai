import styles from "./scanner-solution-animation.module.css";

export type ScannerSolutionAnimationType = "policy" | "trace" | "waterfall";

function WaterfallAnimation() {
  const rows = [
    { x: 32, y: 48, width: 238, color: "#EF9F27", badgeX: 24.5, badgeY: 45.5, badgeColor: "#4285F4", initial: "D", time: "0.483s", label: "3P req", delay: styles.delay1 },
    { x: 38, y: 82, width: 212, color: "#3b82f6", badgeX: 30.5, badgeY: 79.5, badgeColor: "#ff9900", initial: "a", time: "0.714s", label: "Security cookie", delay: styles.delay2 },
    { x: 70, y: 116, width: 230, color: "#E24B4A", badgeX: 62.5, badgeY: 113.5, badgeColor: "#1877f2", initial: "M", time: "2.02s", label: "Ads", delay: styles.delay3 },
    { x: 80, y: 150, width: 205, color: "#EF9F27", badgeX: 72.5, badgeY: 147.5, badgeColor: "#e8710a", initial: "G", time: "2.39s", label: "Analytics", delay: styles.delay4 },
    { x: 142, y: 184, width: 153, color: "#E24B4A", badgeX: 134.5, badgeY: 181.5, badgeColor: "#7c3aed", initial: "I", time: "4.87s", label: "Fingerprint", delay: styles.delay5 },
    { x: 151, y: 218, width: 154, color: "#3b82f6", badgeX: 143.5, badgeY: 215.5, badgeColor: "#ff0000", initial: "Y", time: "5.24s", label: "Embeds", delay: styles.delay6 },
    { x: 228, y: 252, width: 92, color: "#79BE34", badgeX: 220.5, badgeY: 249.5, badgeColor: "#6cc04a", initial: "O", time: "8.31s", label: "CMP", delay: styles.delay7 }
  ] as const;

  return (
    <svg className={styles.visual} viewBox="0 0 340 300" role="img" aria-label="Pre-consent cookies and trackers waterfall with consent timing marker">
      <rect x="20" y="34" width="300" height="246" fill="#E24B4A" opacity="0.1" />
      <line x1="320" y1="14" x2="320" y2="286" stroke="#E24B4A" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
      <rect x="311" y="16" width="18" height="62" rx="9" fill="#E24B4A" />
      <text transform="translate(317.5 25) rotate(90)" fontSize="10" fill="#ffffff" fontWeight="500">consent</text>
      <text x="20" y="24" fontSize="13.5" fill="#ffffff" fontWeight="600">Pre-consent cookies &amp; trackers:</text>
      {rows.map((row) => (
        <g key={row.time}>
          <g className={`${styles.waterfallBar} ${row.delay}`}>
            <rect x={row.x} y={row.y} width={row.width} height="10" rx="5" fill={row.color} />
          </g>
          <g className={`${styles.waterfallBadge} ${row.delay}`}>
            <rect x={row.badgeX} y={row.badgeY} width="15" height="15" rx="4" fill={row.badgeColor} stroke="#0b2340" strokeWidth="1.5" />
            <text x={row.x} y={row.y + 8.5} textAnchor="middle" fontSize="8.5" fill="#ffffff" fontWeight="600">{row.initial}</text>
          </g>
          <text x={row.x} y={row.y + 24} fontSize="9.5" fontFamily="monospace">
            <tspan fill="#ffffff">{row.time}</tspan>
            <tspan fill="#b6c8dd" dx="8">{row.label}</tspan>
          </text>
        </g>
      ))}
    </svg>
  );
}

function PolicyAnimation() {
  return (
    <svg className={styles.visual} viewBox="0 0 340 300" role="img" aria-label="Radar sweep lighting up privacy policy, cookie policy, and terms of use surfaces">
      <text x="20" y="24" fontSize="13.5" fill="#ffffff" fontWeight="600">Find policy surfaces:</text>
      <circle cx="170" cy="172" r="110" fill="#0e2a4d" stroke="#24466f" />
      <circle cx="170" cy="172" r="80" fill="none" stroke="#24466f" />
      <circle cx="170" cy="172" r="50" fill="none" stroke="#24466f" />
      <circle cx="170" cy="172" r="22" fill="none" stroke="#24466f" />
      <line x1="60" y1="172" x2="280" y2="172" stroke="#24466f" strokeWidth="0.5" />
      <line x1="170" y1="62" x2="170" y2="282" stroke="#24466f" strokeWidth="0.5" />
      <g className={styles.radarSweep}>
        <path d="M170 172 L170 62 A110 110 0 0 1 216 72.3 Z" fill="#79BE34" opacity="0.22" />
        <line x1="170" y1="172" x2="170" y2="62" stroke="#79BE34" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <circle cx="170" cy="172" r="4.5" fill="#79BE34" />
      <g className={styles.privacySurface}>
        <circle cx="238" cy="116" r="8" fill="#E24B4A" />
        <g transform="translate(182,84) scale(1.3)" fill="none" stroke="#ef9d9c" strokeWidth="1.3"><path d="M5 0 L10 2 V6 Q5 10.5 0 6 V2 Z" /></g>
        <text x="200" y="97" fontSize="13" fill="#ef9d9c" fontFamily="monospace">privacy policy</text>
      </g>
      <g className={styles.cookieSurface}>
        <circle cx="112" cy="228" r="8" fill="#EF9F27" />
        <g transform="translate(58,242) scale(1.3)"><circle cx="5" cy="5" r="5" fill="none" stroke="#f3c37e" strokeWidth="1.3" /><circle cx="3.4" cy="3.6" r="0.9" fill="#f3c37e" /><circle cx="6.6" cy="4.4" r="0.9" fill="#f3c37e" /><circle cx="4.6" cy="7" r="0.9" fill="#f3c37e" /></g>
        <text x="76" y="254" fontSize="13" fill="#f3c37e" fontFamily="monospace">cookie policy</text>
      </g>
      <g className={styles.termsSurface}>
        <circle cx="234" cy="226" r="8" fill="#7fb0e8" />
        <g transform="translate(184,238) scale(1.3)" stroke="#a9c9ec" strokeWidth="1.3" fill="none"><rect x="0" y="0" width="8" height="10" rx="1" /><line x1="2" y1="3" x2="6" y2="3" /><line x1="2" y1="5.5" x2="6" y2="5.5" /><line x1="2" y1="8" x2="4.5" y2="8" /></g>
        <text x="201" y="250" fontSize="13" fill="#a9c9ec" fontFamily="monospace">terms of use</text>
      </g>
    </svg>
  );
}

function TraceAnimation() {
  return (
    <svg className={styles.visual} viewBox="0 0 340 300" role="img" aria-label="Regional scan origins tracing Ireland, Germany, and California on a world map">
      <text x="20" y="24" fontSize="13.5" fill="#ffffff" fontWeight="600">Scan from and trace:</text>
      <image href="/marketing/world-map-110m.svg" x="0" y="0" width="340" height="300" />
      <circle cx="163" cy="90" r="3.5" fill="#9bd45e" />
      <circle cx="178" cy="93" r="3.5" fill="#9bd45e" />
      <circle cx="70" cy="113" r="3.5" fill="#9bd45e" />
      <line x1="163" y1="90" x2="139" y2="66" stroke="#4a72a0" />
      <line x1="178" y1="93" x2="216" y2="72" stroke="#4a72a0" />
      <line x1="70" y1="113" x2="48" y2="142" stroke="#4a72a0" />
      <g>
        <g transform="translate(100 40)"><rect width="13" height="28" fill="#169b62" /><rect x="13" width="13" height="28" fill="#ffffff" /><rect x="26" width="13" height="28" fill="#ff883e" /></g>
        <rect x="100" y="40" width="39" height="28" fill="none" stroke="#0b2340" strokeWidth="1.2" />
        <text x="119.5" y="83" textAnchor="middle" fontSize="12.5" fill="#ffffff" fontFamily="monospace" fontWeight="600">EU-IR</text>
      </g>
      <g>
        <g transform="translate(216 52)"><rect width="39" height="9.33" fill="#2b2b2b" /><rect y="9.33" width="39" height="9.33" fill="#dd0000" /><rect y="18.66" width="39" height="9.34" fill="#ffce00" /></g>
        <rect x="216" y="52" width="39" height="28" fill="none" stroke="#0b2340" strokeWidth="1.2" />
        <text x="235.5" y="95" textAnchor="middle" fontSize="12.5" fill="#ffffff" fontFamily="monospace" fontWeight="600">EU-DE</text>
      </g>
      <g>
        <g transform="translate(24 142)">
          <rect width="39" height="28" fill="#f7f3ec" />
          <rect y="23" width="39" height="5" fill="#b32134" />
          <path transform="translate(6,6) scale(1.05)" d="M0,-3 L0.9,-0.9 L3,-0.9 L1.2,0.5 L1.85,2.6 L0,1.3 L-1.85,2.6 L-1.2,0.5 L-3,-0.9 L-0.9,-0.9 Z" fill="#b32134" />
          <g transform="translate(11,10)" fill="#8a5a2b"><path d="M2 6 Q3 3.5 6 3.6 Q7.5 1.8 10 2.2 Q13.5 1.4 16 2.6 Q18.5 2 19.5 3.8 Q20.5 5.4 18.8 5.8 L18.8 7.6 L17.4 7.6 L17.2 6.2 Q13.5 7 10.5 6.4 L10.2 7.6 L8.8 7.6 Q8.2 6.2 6.8 6.2 L6.4 7.6 L5 7.6 L4.6 6.2 Q3 6.4 2 6 Z" /></g>
          <path d="M9 17.5 Q19.5 15.5 30 17.5 L30 18.5 Q19.5 16.8 9 18.5 Z" fill="#3e7a33" />
        </g>
        <rect x="24" y="142" width="39" height="28" fill="none" stroke="#0b2340" strokeWidth="1.2" />
        <text x="43.5" y="185" textAnchor="middle" fontSize="12.5" fill="#ffffff" fontFamily="monospace" fontWeight="600">California</text>
      </g>
      <g fill="none" stroke="#9bd45e" strokeWidth="2.5">
        <circle className={`${styles.sonarPing} ${styles.ping1}`} cx="163" cy="90" r="6" />
        <circle className={`${styles.sonarPing} ${styles.ping1b}`} cx="163" cy="90" r="6" />
        <circle className={`${styles.sonarPing} ${styles.ping2}`} cx="178" cy="93" r="6" />
        <circle className={`${styles.sonarPing} ${styles.ping2b}`} cx="178" cy="93" r="6" />
        <circle className={`${styles.sonarPing} ${styles.ping3}`} cx="70" cy="113" r="6" />
        <circle className={`${styles.sonarPing} ${styles.ping3b}`} cx="70" cy="113" r="6" />
      </g>
    </svg>
  );
}

export function ScannerSolutionAnimation({ type }: { type: ScannerSolutionAnimationType }) {
  if (type === "waterfall") return <WaterfallAnimation />;
  if (type === "policy") return <PolicyAnimation />;
  return <TraceAnimation />;
}
