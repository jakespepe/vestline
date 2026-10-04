import { useCallback, useEffect, useMemo, useState } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { Curve } from "./Curve";
import { DAY, PRESETS, scanSchedules, vestedAt, vestline, type Schedule } from "./vesting";
import { addr, bool, i128, txLink, u64, XLM_SAC } from "./lib/stellar";
import { dateOf, fromUnits, short, toUnits } from "./lib/format";
import { useWallet } from "./lib/useWallet";
import { useAction } from "./lib/useAction";

export type Wallet = ReturnType<typeof useWallet>;

export function Workspace({ wallet }: { wallet: Wallet }) {
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [selected, setSelected] = useState<bigint | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const all = await scanSchedules();
    setSchedules(all);
    setSelected((cur) => cur ?? all[0]?.id ?? null);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const current = schedules?.find((s) => s.id === selected) ?? null;
  const mine = wallet.address ? schedules?.filter((s) => s.beneficiary === wallet.address || s.grantor === wallet.address) : null;

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <button className="b b-line" onClick={() => setCreating((v) => !v)}>
            {creating ? "Back to grants" : "New grant"}
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-8 pt-4">
        <p className="eyebrow">Token vesting · Stellar testnet</p>
        <h1 className="mt-2 max-w-3xl font-serif text-5xl leading-[1.05] text-teal md:text-6xl">
          Grants that unlock on schedule, <em className="text-tangerine">enforced by code</em>.
        </h1>
        <p className="mt-4 max-w-2xl text-dim">
          Tokens are escrowed up front. Beneficiaries claim whatever has vested, whenever they like. Revoking a grant
          returns only what hasn't vested: nobody can claw back what's already earned.
        </p>
      </section>

      <main className="mx-auto max-w-6xl px-6 pb-16">
        {creating ? (
          <CreateGrant wallet={wallet} onCreated={(id) => (refresh(), setSelected(id), setCreating(false))} />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
            <aside>
              <p className="eyebrow mb-3">{mine ? "Your grants" : "All grants"}</p>
              <div className="space-y-2">
                {schedules === null && <p className="text-sm text-dim">Loading…</p>}
                {(mine ?? schedules ?? []).map((s) => (
                  <button
                    key={String(s.id)}
                    onClick={() => setSelected(s.id)}
                    className={`sheet w-full p-3 text-left transition ${s.id === selected ? "border-teal ring-1 ring-teal" : "hover:border-teal-2"}`}
                  >
                    <div className="flex justify-between text-sm">
                      <b>Grant #{String(s.id)}</b>
                      <span className="text-dim">{s.revoked ? "revoked" : s.revocable ? "revocable" : "fixed"}</span>
                    </div>
                    <p className="mt-1 text-xs text-dim">
                      {fromUnits(s.total)} {s.token === XLM_SAC ? "XLM" : short(s.token)} → {short(s.beneficiary)}
                    </p>
                  </button>
                ))}
                {mine && mine.length === 0 && <p className="text-sm text-dim">No grants involve this wallet yet.</p>}
              </div>
            </aside>
            {current ? <GrantDetail s={current} wallet={wallet} onChange={refresh} /> : <div className="sheet p-10 text-dim">Select a grant.</div>}
          </div>
        )}
      </main>

    </div>
  );
}

function Feedback({ a }: { a: ReturnType<typeof useAction> }) {
  if (a.error) return <p className="mt-3 border-l-4 border-tangerine bg-tangerine/5 px-3 py-2 text-sm text-tangerine">{a.error}</p>;
  if (a.notice)
    return (
      <p className="mt-3 border-l-4 border-teal-2 bg-teal-2/5 px-3 py-2 text-sm text-teal">
        {a.notice.text}{" "}
        {a.notice.hash && (
          <a className="underline" href={txLink(a.notice.hash)} target="_blank" rel="noreferrer">
            transaction ↗
          </a>
        )}
      </p>
    );
  return null;
}

function GrantDetail({ s, wallet, onChange }: { s: Schedule; wallet: Wallet; onChange: () => void }) {
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);
  const act = useAction();
  const [newWallet, setNewWallet] = useState("");
  const vested = s.revoked ? s.total : vestedAt(s, now);
  const claimable = s.revoked ? 0n : vested - s.claimed;
  const unit = s.token === XLM_SAC ? "XLM" : short(s.token);
  const isBen = wallet.address === s.beneficiary;
  const isGrantor = wallet.address === s.grantor;
  const call = (label: string, method: string, args: Parameters<typeof vestline.invoke>[2], text: string) =>
    act.run(label, async () => {
      const r = await vestline.invoke(wallet.address!, method, args);
      onChange();
      return r;
    }, (r) => ({ text, hash: r.hash }));

  return (
    <section className="sheet p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-3xl text-teal">Grant #{String(s.id)}</h2>
        <p className="text-sm text-dim">
          {short(s.grantor)} → <b className="text-ink">{short(s.beneficiary)}</b> {isBen && "(you)"}
        </p>
      </div>
      <div className="mt-4">
        <Curve s={s} now={now} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-dim">
        <span>start {dateOf(s.start)}</span>
        <span>cliff {dateOf(s.start + s.cliff)}</span>
        <span>fully vested {dateOf(s.start + s.duration)}</span>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Total", s.total],
          ["Vested", vested],
          ["Claimed", s.claimed],
          ["Claimable now", claimable],
        ].map(([k, v]) => (
          <div key={String(k)} className="border-l-2 border-rule pl-3">
            <dt className="eyebrow">{String(k)}</dt>
            <dd className={`mt-1 font-serif text-2xl ${k === "Claimable now" ? "text-tangerine" : "text-teal"}`}>
              {fromUnits(v as bigint)} <span className="font-sans text-xs text-dim">{unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        {isBen && !s.revoked && (
          <button className="b b-orange" disabled={!!act.busy || claimable <= 0n} onClick={() => call("claim", "claim", [u64(s.id)], "Claimed.")}>
            Claim {fromUnits(claimable)} {unit}
          </button>
        )}
        {isGrantor && s.revocable && !s.revoked && (
          <button
            className="b b-line"
            disabled={!!act.busy}
            onClick={() =>
              confirm(`Revoke? ${fromUnits(claimable)} ${unit} goes to the beneficiary, the unvested rest back to you.`) &&
              call("revoke", "revoke", [u64(s.id)], "Grant revoked.")
            }
          >
            Revoke grant
          </button>
        )}
        {!wallet.address && <p className="text-sm text-dim">Connect the beneficiary's wallet to claim.</p>}
      </div>
      {isBen && !s.revoked && (
        <div className="mt-6 flex max-w-lg items-end gap-3">
          <label className="flex-1 text-sm text-dim">
            Move this grant to a new wallet
            <input className="in font-mono text-xs" placeholder="G…" value={newWallet} onChange={(e) => setNewWallet(e.target.value.trim())} />
          </label>
          <button
            className="b b-line"
            disabled={!!act.busy || !StrKey.isValidEd25519PublicKey(newWallet)}
            onClick={() => call("move", "transfer_beneficiary", [u64(s.id), addr(newWallet)], "Grant moved.")}
          >
            Move
          </button>
        </div>
      )}
      <Feedback a={act} />
      <p className="mt-6 text-xs text-dim">
        {s.revoked ? "Revoked: the vested amount is frozen." : s.revocable ? "Revocable by the grantor (vested tokens always stay with the beneficiary)." : "Irrevocable: nobody can end this grant early."}
      </p>
    </section>
  );
}

function CreateGrant({ wallet, onCreated }: { wallet: Wallet; onCreated: (id: bigint) => void }) {
  const [beneficiary, setBeneficiary] = useState("");
  const [amount, setAmount] = useState("1000");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [preset, setPreset] = useState(0);
  const [cliffDays, setCliffDays] = useState(365);
  const [years, setYears] = useState(4);
  const [revocable, setRevocable] = useState(true);
  const [token, setToken] = useState(XLM_SAC);
  const act = useAction();

  const choose = (i: number) => {
    setPreset(i);
    setCliffDays(Math.round(PRESETS[i].cliff / DAY));
    setYears(PRESETS[i].duration / 31_536_000);
    setRevocable(PRESETS[i].revocable);
  };
  const preview = useMemo(() => {
    let total = 1n;
    try {
      total = toUnits(amount || "0") || 1n;
    } catch {
      /* keep preview */
    }
    return {
      total,
      start: BigInt(Math.floor(new Date(startDate).getTime() / 1000) || 0),
      cliff: BigInt(cliffDays * DAY),
      duration: BigInt(Math.round(years * 31_536_000)),
    };
  }, [amount, startDate, cliffDays, years]);

  return (
    <form
      className="grid gap-8 lg:grid-cols-[1fr_1.2fr]"
      onSubmit={async (e) => {
        e.preventDefault();
        const me = wallet.address ?? (await wallet.connect());
        if (!me) return;
        const r = await act.run(
          "create",
          async () => {
            if (!StrKey.isValidEd25519PublicKey(beneficiary)) throw new Error("Enter the beneficiary's G… address.");
            if (preview.cliff > preview.duration) throw new Error("The cliff can't be longer than the whole schedule.");
            return vestline.invoke<bigint>(me, "create_schedule", [
              addr(me),
              addr(beneficiary),
              addr(token),
              i128(toUnits(amount)),
              u64(preview.start),
              u64(preview.cliff),
              u64(preview.duration),
              bool(revocable),
            ]);
          },
          (res) => ({ text: `Grant #${res.result} created and funded.`, hash: res.hash }),
        );
        if (r) setTimeout(() => onCreated(r.result), 1200);
      }}
    >
      <div className="sheet space-y-5 p-6">
        <h2 className="font-serif text-3xl text-teal">New grant</h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p, i) => (
            <button type="button" key={p.name} onClick={() => choose(i)} className={`b text-xs ${preset === i ? "b-teal" : "b-line"}`}>
              {p.name}
            </button>
          ))}
        </div>
        <label className="block text-sm text-dim">
          Beneficiary
          <input className="in font-mono text-xs" placeholder="G…" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value.trim())} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm text-dim">
            Amount
            <input className="in" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="block text-sm text-dim">
            Start
            <input className="in" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="block text-sm text-dim">
            Cliff (days)
            <input className="in" type="number" min="0" value={cliffDays} onChange={(e) => setCliffDays(Number(e.target.value))} />
          </label>
          <label className="block text-sm text-dim">
            Total length (years)
            <input className="in" type="number" min="0.1" step="0.5" value={years} onChange={(e) => setYears(Number(e.target.value))} />
          </label>
        </div>
        <label className="block text-sm text-dim">
          Asset contract
          <input className="in font-mono text-xs" value={token} onChange={(e) => setToken(e.target.value.trim())} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={revocable} onChange={(e) => setRevocable(e.target.checked)} /> Revocable by me
        </label>
        <button className="b b-orange w-full" disabled={!!act.busy}>
          {act.busy ? "Confirm in wallet…" : `Escrow ${amount} and create grant`}
        </button>
        <Feedback a={act} />
      </div>
      <div className="sheet p-6">
        <p className="eyebrow">Preview</p>
        <Curve s={preview} now={Number(preview.start) + Number(preview.duration) * 0.35} />
        <p className="mt-3 text-sm text-dim">
          Nothing unlocks for {cliffDays} days, then {fromUnits((preview.total * preview.cliff) / (preview.duration || 1n))} at the cliff,
          then linearly until {dateOf(preview.start + preview.duration)}.
        </p>
      </div>
    </form>
  );
}
