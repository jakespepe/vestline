import { useEffect, useState } from "react";
import { scanSchedules, vestedAt, type Schedule } from "../vesting";
import { XLM_SAC } from "../lib/stellar";
import { fromUnits } from "../lib/format";
import { Link, useTitle } from "../lib/router";

export function Home() {
  const [failed, setFailed] = useState(false);
  useTitle("Vestline · token vesting with cliffs, enforced on-chain");
  const [grants, setGrants] = useState<Schedule[] | null>(null);
  useEffect(() => {
    scanSchedules().then(setGrants).catch(() => setFailed(true));
  }, []);
  const xlm = (grants ?? []).filter((g) => g.token === XLM_SAC);
  const now = Date.now() / 1000;
  const STATS: [string, string][] = [
    ["Grants", grants ? String(grants.length) : "…"],
    ["XLM granted", grants ? fromUnits(xlm.reduce((a, g) => a + g.total, 0n)) : "…"],
    ["XLM vested", grants ? fromUnits(xlm.reduce((a, g) => a + (g.revoked ? g.claimed : vestedAt(g, now)), 0n)) : "…"],
  ];
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 md:grid-cols-[1.2fr_1fr] md:pt-20">
        <div>
          <p className="eyebrow">Token vesting on Stellar</p>
          <h1 className="mt-4 text-5xl leading-[1.03] md:text-6xl font-serif text-teal">Grants that unlock on schedule, <em className="text-tangerine">enforced by code</em>.</h1>
          <p className="mt-6 max-w-xl text-lg text-dim">Escrow tokens for a teammate, an investor or a grantee. They vest linearly after an optional cliff, the beneficiary claims whenever they like, and revoking a grant can never claw back what has already vested.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/app" className="b b-teal inline-block">Open grants →</Link>
            <Link to="/docs" className="b b-line inline-block">How it works</Link>
          </div>
          <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6">
            {STATS.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] uppercase tracking-wider text-dim">{label}</dt>
                <dd className="mt-1 text-2xl font-serif text-teal">{value}</dd>
              </div>
            ))}
          </dl>
          {failed && (
            <p className="mt-6 text-sm opacity-80" role="status">
              Couldn’t reach Stellar testnet, so live numbers aren’t shown.{" "}
              <button className="font-semibold underline" onClick={() => window.location.reload()}>
                Retry
              </button>
            </p>
          )}
        </div>
        <div className="sheet p-7">
          <p className="eyebrow">A typical grant</p>
          <p className="mt-2 font-serif text-2xl text-teal">4 years, 1-year cliff</p>
          <svg viewBox="0 0 320 180" className="mt-5 w-full" role="img" aria-label="Vesting curve">
            <line x1="24" y1="160" x2="310" y2="160" stroke="#e7e3da" strokeWidth="2" />
            <line x1="24" y1="16" x2="24" y2="160" stroke="#e7e3da" strokeWidth="2" />
            <path d="M24 160 L95 160 L95 124 L310 16" fill="none" stroke="#0f4c5c" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="95" cy="124" r="5" fill="#e36414" />
            <text x="103" y="142" fontSize="11" fill="#5d7078">cliff: 25% unlocks</text>
            <text x="222" y="44" fontSize="11" fill="#5d7078">fully vested</text>
            <text x="24" y="176" fontSize="10" fill="#5d7078">start</text>
            <text x="286" y="176" fontSize="10" fill="#5d7078">4 yrs</text>
          </svg>
          <p className="mt-3 text-sm text-dim">
            Nothing is claimable before the cliff. At the cliff, everything accrued since the start unlocks, then it keeps vesting every second.
          </p>
        </div>
      </section>

      <section className="border-y border-rule bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 text-3xl md:text-4xl font-serif text-teal">Escrow once, unlock every second</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="sheet p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold bg-tangerine text-white">{i + 1}</span>
                <h3 className="mt-4 text-xl font-serif text-teal">{title}</h3>
                <p className="mt-2 text-sm text-dim">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className="eyebrow">Use cases</p>
        <h2 className="mt-3 text-3xl md:text-4xl font-serif text-teal">Whenever tokens should be earned over time</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {USES.map(([icon, title, body]) => (
            <div key={title} className="sheet p-6">
              <span className="text-3xl">{icon}</span>
              <h3 className="mt-3 text-lg font-serif text-teal">{title}</h3>
              <p className="mt-2 text-sm text-dim">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5">
        <p className="eyebrow">Guarantees</p>
        <h2 className="mt-3 text-3xl md:text-4xl font-serif text-teal">Fair to grantors and beneficiaries</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PROMISES.map(([title, body]) => (
            <div key={title} className="rounded-2xl p-7 bg-teal text-white">
              <h3 className="text-xl font-serif">{title}</h3>
              <p className="mt-2 text-sm text-white/75">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-20">
        <div className="sheet flex flex-col items-start justify-between gap-6 p-10 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-serif text-teal">Set up a vesting grant.</h2>
            <p className="mt-2 text-dim">Start from a preset like 4 years with a 1-year cliff, or set your own cliff and duration.</p>
          </div>
          <Link to="/app" className="b b-teal inline-block shrink-0">Open grants →</Link>
        </div>
      </section>
    </>
  );
}

const STEPS: [string, string][] = [
  [
    "Create a grant",
    "Choose the beneficiary, token, total, start, cliff and duration. The full amount moves into escrow."
  ],
  [
    "It vests",
    "Nothing before the cliff. After it, the vested amount grows linearly until the end date."
  ],
  [
    "Beneficiary claims",
    "Claim any time, as often as you like. Each claim sends whatever has vested and not yet been claimed."
  ]
];

const USES: [string, string, string][] = [
  [
    "👩‍💻",
    "Team tokens",
    "4-year schedules with a 1-year cliff, the startup standard."
  ],
  [
    "💼",
    "Investor lockups",
    "Tokens unlock gradually after launch, not all on day one."
  ],
  [
    "🎓",
    "Grants",
    "Stream a grant over months instead of paying it in one lump."
  ],
  [
    "🤝",
    "Advisors",
    "Short cliffs with revocable schedules in case the engagement ends."
  ]
];

const PROMISES: [string, string][] = [
  [
    "Funded up front",
    "Tokens are escrowed at creation, so the beneficiary knows the money really exists."
  ],
  [
    "Vested is final",
    "Revoking returns only the unvested part to the grantor. Vested tokens stay claimable."
  ],
  [
    "Portable",
    "Beneficiaries can move a grant to a new address, such as a fresh wallet."
  ]
];
