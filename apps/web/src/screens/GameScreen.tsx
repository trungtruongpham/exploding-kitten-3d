import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CardType } from '@meobom/engine';
import { isAlley } from '@meobom/engine';
import { TableCanvas } from '../game/TableCanvas';
import type { Pick, TableScene } from '../game/TableScene';
import { logLine } from '../game/logText';
import { CARD_NAMES, CARD_TEXT, T } from '../i18n';
import { act, backToLobby, inviteLink, leaveRoom, serverNow, toast, useStore } from '../net';

type Targeting = { kind: 'bribe' | 'pair'; cardIds: string[] } | null;

/** Re-renders every `ms` so countdowns move. */
function useTicker(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** Remembers when a deadline was first seen so a countdown can show the fraction left. */
function useWindow(deadline: number | null) {
  const start = useRef<{ deadline: number; at: number } | null>(null);
  if (deadline === null) start.current = null;
  else if (!start.current || start.current.deadline !== deadline) start.current = { deadline, at: serverNow() };
  if (!start.current || deadline === null) return { left: 0, frac: 0 };
  const total = Math.max(1, deadline - start.current.at);
  const left = Math.max(0, deadline - serverNow());
  return { left, frac: left / total };
}

export function GameScreen() {
  const update = useStore((s) => s.update);
  const room = useStore((s) => s.room);
  const [selected, setSelected] = useState<string[]>([]);
  const [targeting, setTargeting] = useState<Targeting>(null);
  const [peek, setPeek] = useState<CardType[] | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [pop, setPop] = useState<{ text: string; id: number } | null>(null);
  const scene = useRef<TableScene | null>(null);
  useTicker(100);

  const v = update?.view ?? null;
  const you = v?.you ?? null;
  const me = v?.players.find((p) => p.id === you) ?? null;
  const nameOf = useCallback((id: string) => (id === you ? T.you : (v?.players.find((p) => p.id === id)?.name ?? '?')), [v, you]);
  const isHost = !!room?.members.find((m) => m.id === room.you)?.isHost;

  // events: log lines, pop words, peek, cleanup of local selection
  useEffect(() => {
    if (!update) return;
    const { view, events } = update;
    if (events.some((e) => e.kind === 'dealt')) setLog([]);
    const lines = events.map((e) => logLine(e, view)).filter((x): x is string => !!x);
    if (lines.length) setLog((l) => [...lines.reverse(), ...l].slice(0, 8));
    for (const e of events) {
      if (e.kind === 'hissed') setPop({ text: T.pop.hiss, id: Math.random() });
      if (e.kind === 'defused') setPop({ text: T.pop.snip, id: Math.random() });
      if (e.kind === 'exploded') {
        setPop({ text: T.pop.boom, id: Math.random() });
        if (e.player === view.you) toast(T.youAreOut);
      }
      if (e.kind === 'peeked' && e.player === view.you && e.top) {
        setPeek(e.top);
        scene.current?.showPeek(e.top);
      }
    }
    const inHand = new Set(view.hand.map((c) => c.id));
    setSelected((s) => s.filter((id) => inHand.has(id)));
    if (view.phase.kind !== 'turn' || view.turn !== view.you) setTargeting(null);
  }, [update]);

  const phase = v?.phase;
  const alive = !!me?.alive;
  const myTurn = !!v && alive && v.turn === you && phase?.kind === 'turn';
  const hand = v?.hand ?? [];
  const lastHisser = phase?.kind === 'hiss' ? (phase.play.hissers[phase.play.hissers.length - 1] ?? phase.play.actor) : null;
  const canHiss = phase?.kind === 'hiss' && alive && lastHisser !== you && hand.some((c) => c.type === 'hiss');
  const giving = phase?.kind === 'give' && phase.from === you;
  const targets = useMemo(() => (v ? v.players.filter((p) => p.id !== you && p.alive && p.handCount > 0).map((p) => p.id) : []), [v, you]);

  const doPlay = useCallback(
    async (ids: string[]) => {
      const card = hand.find((c) => c.id === ids[0]);
      if (!card || !myTurn) return;
      if (card.type === 'hiss') return toast(T.saveHiss);
      if (card.type === 'snip') return toast(T.snipOnly);
      if (isAlley(card.type)) {
        const partner = hand.find((c) => c.type === card.type && c.id !== card.id);
        if (!partner) return toast(T.needPair(CARD_NAMES[card.type]));
        if (!targets.length) return toast(T.noTargets);
        setSelected([card.id, partner.id]);
        setTargeting({ kind: 'pair', cardIds: [card.id, partner.id] });
        return;
      }
      if (card.type === 'bribe') {
        if (!targets.length) return toast(T.noTargets);
        setTargeting({ kind: 'bribe', cardIds: [card.id] });
        return;
      }
      setSelected([]);
      await act({ type: 'play', cardIds: [card.id] });
    },
    [hand, myTurn, targets],
  );

  const draw = useCallback(() => {
    if (!myTurn) return;
    setSelected([]);
    setTargeting(null);
    void act({ type: 'draw' });
  }, [myTurn]);

  const hiss = useCallback(() => {
    if (canHiss) void act({ type: 'hiss' });
  }, [canHiss]);

  const onPick = useCallback(
    (p: Pick | null) => {
      if (!v) return;
      if (targeting) {
        if (p?.kind === 'seat') {
          const t = targeting;
          setTargeting(null);
          setSelected([]);
          void act({ type: 'play', cardIds: t.cardIds, target: p.id });
        }
        return;
      }
      if (!p) return setSelected([]);
      if (p.kind === 'deck') return draw();
      if (p.kind === 'card') {
        if (giving) return void act({ type: 'give', cardId: p.id });
        if (!myTurn) {
          setSelected((s) => (s[0] === p.id ? [] : [p.id]));
          return;
        }
        if (selected[0] === p.id) void doPlay([p.id]);
        else setSelected([p.id]);
      }
    },
    [v, targeting, giving, myTurn, selected, doPlay, draw],
  );

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'BUTTON') return;
      if (e.key === ' ') {
        e.preventDefault();
        draw();
      } else if (e.key === 'Enter' && selected.length) void doPlay(selected);
      else if (e.key === 'h' || e.key === 'H') hiss();
      else if (e.key === 'Escape') {
        setTargeting(null);
        setSelected([]);
      } else if (/^[1-9]$/.test(e.key)) {
        const c = hand[Number(e.key) - 1];
        if (c) setSelected((s) => (s[0] === c.id ? [] : [c.id]));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draw, doPlay, hiss, hand, selected]);

  const hissWin = useWindow(phase?.kind === 'hiss' ? v!.deadline : null);
  const fuseWin = useWindow(phase?.kind === 'defuse' ? v!.deadline : null);
  const turnLeft = myTurn ? Math.max(0, v!.deadline - serverNow()) : 0;

  if (!v || !room) return <div className="center-note">{T.connecting}</div>;

  const turnName = nameOf(v.turn);
  let banner = '';
  if (phase?.kind === 'over') banner = phase.winner === you ? T.youWin : T.wins(nameOf(phase.winner));
  else if (targeting) banner = `${targeting.kind === 'pair' ? T.pickTargetSteal : T.pickTargetBribe} ${T.escToCancel}`;
  else if (phase?.kind === 'defuse') banner = phase.player === you ? T.fuseTitleMe : T.fuseOther(nameOf(phase.player));
  else if (phase?.kind === 'placeFuse') banner = phase.player === you ? T.hideTitle : T.hiding(nameOf(phase.player));
  else if (phase?.kind === 'give') banner = giving ? T.giveTitle(nameOf(phase.to)) : T.waitingGive(nameOf(phase.from), nameOf(phase.to));
  else if (myTurn) banner = v.pending > 1 ? T.yourTurnShort : T.yourTurn;
  else banner = T.turnOf(turnName);

  const sel = selected.length ? hand.find((c) => c.id === selected[0]) : null;
  const hissPlay = phase?.kind === 'hiss' ? phase.play : null;

  return (
    <div className="game">
      <TableCanvas update={update} selection={selected} targetable={targeting ? targets : []} onPick={onPick} onReady={(t) => (scene.current = t)} />
      <div id="vignette" className={phase?.kind === 'defuse' ? 'on' : ''} />
      {pop && (
        <div key={pop.id} className="pop show">
          {pop.text}
        </div>
      )}

      <header className="hud-top">
        <div className="brand">
          <span className="logo">{T.appName}</span>
          <button
            className="chip"
            title={T.copyLink}
            onClick={() => {
              void navigator.clipboard?.writeText(inviteLink(room.code)).then(() => toast(T.copied), () => toast(inviteLink(room.code)));
            }}
          >
            {T.room} <b>{room.code}</b>
          </button>
        </div>
      </header>

      <aside className="stats" aria-label="Chồng bài">
        <div className="stat">
          <b>{v.deckCount}</b>
          <small>{T.drawPile}</small>
        </div>
        <div className="stat fuse">
          <b>{v.fuseCount}</b>
          <small>{T.fuses}</small>
        </div>
      </aside>

      {!alive && phase?.kind !== 'over' && <div className="spectating">{T.spectating}</div>}
      <div className="banner" aria-live="polite">
        <span>{banner}</span>
        {v.pending > 1 && phase?.kind === 'turn' && <span className="turns">×{v.pending}</span>}
        {myTurn && turnLeft < 15000 && <span className="timer">{Math.ceil(turnLeft / 1000)}s</span>}
        {targeting && (
          <button className="link" onClick={() => (setTargeting(null), setSelected([]))}>
            {T.cancel}
          </button>
        )}
      </div>

      {hissPlay && (
        <div className="hissbar">
          <div className="t">
            {hissPlay.hissers.length
              ? T.hissedBy(nameOf(hissPlay.hissers[hissPlay.hissers.length - 1]))
              : T.playedBy(nameOf(hissPlay.actor), CARD_NAMES[hissPlay.type], hissPlay.target ? nameOf(hissPlay.target) : undefined)}{' '}
            {T.anyHiss}
          </div>
          {canHiss && (
            <button className="hissbtn" onClick={hiss}>
              {T.hissBtn} <kbd>H</kbd>
            </button>
          )}
          <div className="track">
            <i style={{ transform: `scaleX(${hissWin.frac})` }} />
          </div>
        </div>
      )}

      {sel && alive && !giving && (
        <div className="selinfo">
          <b>{CARD_NAMES[sel.type]}</b>
          {CARD_TEXT[sel.type]}
        </div>
      )}

      {alive && phase?.kind !== 'over' && (
        <nav className="actions" aria-label="Hành động">
          <button className="btn primary" disabled={!myTurn} onClick={draw}>
            {T.draw} <kbd>Space</kbd>
          </button>
          <button className="btn" disabled={!myTurn || !selected.length} onClick={() => void doPlay(selected)}>
            {T.playSelected} <kbd>Enter</kbd>
          </button>
        </nav>
      )}
      <button className="btn leave" onClick={leaveRoom}>
        {T.leave}
      </button>

      <ol className="log" aria-live="polite">
        {log.map((l, i) => (
          <li key={`${log.length}-${i}`}>{l}</li>
        ))}
      </ol>
      <div className="help">{T.help}</div>

      {phase?.kind === 'defuse' && phase.player === you && (
        <div className="panel">
          <div className="fusehead">
            <div className="ring">
              <svg width="58" height="58" viewBox="0 0 58 58">
                <circle cx="29" cy="29" r="25" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="6" />
                <circle cx="29" cy="29" r="25" fill="none" stroke="#ff5b3d" strokeWidth="6" strokeLinecap="round" strokeDasharray="157.08" strokeDashoffset={157.08 * (1 - fuseWin.frac)} />
              </svg>
              <b>{Math.ceil(fuseWin.left / 1000)}</b>
            </div>
            <div>
              <h2>{T.fuseTitleMe}</h2>
              <p>{phase.hasSnip ? T.fuseHintSnip : T.fuseHintNoSnip}</p>
            </div>
          </div>
          <div className="row">
            <button className="btn go" disabled={!phase.hasSnip} onClick={() => void act({ type: 'defuse' })}>
              {T.snipBtn}
            </button>
            <button className="btn danger" onClick={() => void act({ type: 'explode' })}>
              {T.boomBtn}
            </button>
          </div>
        </div>
      )}

      {phase?.kind === 'placeFuse' && phase.player === you && (
        <div className="panel">
          <h2>{T.hideTitle}</h2>
          <p>{T.hideHelp}</p>
          <div className="row">
            {(
              [
                [T.posTop, 0],
                [T.posSecond, 1],
                [T.posMiddle, Math.floor(v.deckCount / 2)],
                [T.posBottom, v.deckCount],
                [T.posRandom, Math.floor(Math.random() * (v.deckCount + 1))],
              ] as const
            ).map(([label, pos]) => (
              <button key={label} className="btn" onClick={() => void act({ type: 'place', position: pos })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {giving && phase?.kind === 'give' && (
        <div className="panel compact">
          <h2>{T.giveTitle(nameOf(phase.to))}</h2>
          <p>{T.giveHelp}</p>
        </div>
      )}

      {peek && (
        <div className="panel compact">
          <h2>{T.peekTitle}</h2>
          <p>{T.peekHelp}</p>
          <div className="peekrow">
            {peek.map((t, i) => (
              <span key={i}>
                {i + 1}. {CARD_NAMES[t]}
              </span>
            ))}
          </div>
          <div className="row">
            <button
              className="btn primary"
              onClick={() => {
                setPeek(null);
                scene.current?.hidePeek();
              }}
            >
              {T.done}
            </button>
          </div>
        </div>
      )}

      {phase?.kind === 'over' && (
        <div className="panel over">
          <h2>{phase.winner === you ? T.youWin : T.wins(nameOf(phase.winner))}</h2>
          <p>{phase.winner === you ? T.winText : T.loseText}</p>
          <div className="row">
            {isHost ? (
              <button className="btn primary" onClick={() => void backToLobby()}>
                {T.backToLobby}
              </button>
            ) : (
              <p>{T.waitHostRematch}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
