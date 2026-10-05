import { CONTRACT_ID } from "../vesting";
import { contractLink } from "../lib/stellar";
import { useEffect } from "react";
import { Link, useSection, useTitle } from "../lib/router";

const SECTIONS = [
  ["start", "Getting started"],
  ["concepts", "Concepts"],
  ["reference", "Contract reference"],
  ["faq", "FAQ"],
] as const;

export function Docs() {
  useTitle("Docs · Vestline");
  const section = useSection();
  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView({ behavior: "smooth" });
  }, [section]);
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-5 py-14 lg:grid-cols-[210px_1fr]">
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-1 text-sm">
          <p className="mb-3 px-3 eyebrow">On this page</p>
          {SECTIONS.map(([id, label]) => (
            <Link key={id} to={`/docs/${id}`} className="block rounded-lg px-3 py-2 text-teal hover:bg-paper">
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <article className="min-w-0 space-y-16">
        <header>
          <p className="eyebrow">Documentation</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-serif text-teal">How Vestline works</h1>
          <p className="mt-4 max-w-2xl text-lg text-dim">A Soroban contract that escrows tokens and releases them on a linear schedule with an optional cliff.</p>
        </header>

        <section id="start" className="scroll-mt-24 space-y-5">
          <h2 className="text-3xl font-serif text-teal">Getting started</h2>
          <ol className="space-y-3">
            {START.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-tangerine text-white">{i + 1}</span>
                <p className="pt-0.5 text-ink/85">{step}</p>
              </li>
            ))}
          </ol>
          <Link to="/app" className="b b-teal inline-block inline-block">Open grants →</Link>
        </section>

        <section id="concepts" className="scroll-mt-24 space-y-5">
          <h2 className="text-3xl font-serif text-teal">Concepts</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {CONCEPTS.map(([term, body]) => (
              <div key={term} className="sheet p-5">
                <h3 className="text-lg font-serif text-teal">{term}</h3>
                <p className="mt-1.5 text-sm text-dim">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="reference" className="scroll-mt-24 space-y-5">
          <h2 className="text-3xl font-serif text-teal">Contract reference</h2>
          <p className="text-dim">
            Deployed on testnet at{" "}
            <a className="break-all font-mono text-sm underline text-tangerine" href={contractLink(CONTRACT_ID)} target="_blank" rel="noreferrer">{CONTRACT_ID}</a>
          </p>
          <div className="sheet overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-rule text-xs uppercase tracking-wider text-dim">
                <tr>
                  <th className="p-3.5">Function</th>
                  <th className="p-3.5">Signed by</th>
                  <th className="p-3.5">What it does</th>
                </tr>
              </thead>
              <tbody>
                {REFERENCE.map(([fn, who, what]) => (
                  <tr key={fn} className="border-t border-rule">
                    <td className="p-3.5 font-mono text-xs text-teal">{fn}</td>
                    <td className="p-3.5 text-dim">{who}</td>
                    <td className="p-3.5 text-dim">{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 space-y-3">
          <h2 className="text-3xl font-serif text-teal">FAQ</h2>
          {FAQ.map(([q, a]) => (
            <details key={q} className="sheet group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-teal">
                {q}
                <span className="transition group-open:rotate-45 text-tangerine">+</span>
              </summary>
              <p className="mt-3 text-sm text-dim">{a}</p>
            </details>
          ))}
        </section>
      </article>
    </div>
  );
}

const START: string[] = [
  "Install the Freighter browser wallet, switch it to Testnet and fund the account with test XLM from Friendbot (lab.stellar.org/account/fund).",
  "Open the app and choose “New grant”. Pick a preset or set the cliff and duration yourself.",
  "Enter the beneficiary and the amount, choose whether the grant is revocable, and sign. The tokens move into escrow.",
  "The beneficiary connects their wallet, selects the grant and claims whatever has vested."
];

const CONCEPTS: [string, string][] = [
  [
    "Schedule",
    "Grantor, beneficiary, token, total, start, cliff and duration, plus how much has been claimed."
  ],
  [
    "Cliff",
    "A period after the start when nothing is claimable. When it ends, everything accrued since the start unlocks at once."
  ],
  [
    "Vested vs claimable",
    "Vested is what has been earned so far; claimable is vested minus what was already claimed."
  ],
  [
    "Revocable",
    "If set, the grantor can stop the schedule: unvested tokens go back, vested ones stay with the beneficiary."
  ]
];

const REFERENCE: [string, string, string][] = [
  [
    "create_schedules(grantor, token, grants)",
    "grantor",
    "Creates up to 20 grants at once, pulling the combined total once"
  ],
  [
    "create_schedule(grantor, beneficiary, token, total, start, cliff, duration, revocable)",
    "grantor",
    "Escrows the total and returns the schedule id"
  ],
  [
    "claim(schedule_id)",
    "beneficiary",
    "Sends everything claimable"
  ],
  [
    "revoke(schedule_id)",
    "grantor",
    "Ends a revocable grant and returns the unvested part"
  ],
  [
    "transfer_beneficiary(schedule_id, new_beneficiary)",
    "beneficiary",
    "Moves the grant to a new address"
  ],
  [
    "vested · claimable(schedule_id)",
    "—",
    "Amounts as of now"
  ],
  [
    "get_schedule(schedule_id) · schedule_count()",
    "—",
    "Read state"
  ]
];

const FAQ: [string, string][] = [
  [
    "What happens at the cliff?",
    "Everything that accrued between the start and the cliff unlocks at once; from then on it vests continuously."
  ],
  [
    "Can the grantor take tokens back?",
    "Only from a revocable grant, and only the part that hasn’t vested."
  ],
  [
    "Do I have to claim on a schedule?",
    "No. Vested tokens wait in escrow until you claim them, with no deadline."
  ],
  [
    "Which tokens can be vested?",
    "Native XLM and any Stellar asset with a Stellar Asset Contract."
  ],
  [
    "Can I look at grants without a wallet?",
    "Yes. Grants are public; the app lists them and plots each vesting curve."
  ],
  [
    "Is it audited?",
    "Not yet. It runs on Stellar testnet and is open source; treat it as a working prototype until it has been audited."
  ]
];
