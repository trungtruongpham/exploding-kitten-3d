import { useState } from 'react';
import { SEAT_STYLE } from '../game/props';
import { T } from '../i18n';
import { addBot, inviteLink, leaveRoom, removeMember, startGame, toast, useStore } from '../net';

export function Lobby() {
  const room = useStore((s) => s.room)!;
  const [copied, setCopied] = useState(false);
  const me = room.members.find((m) => m.id === room.you);
  const isHost = !!me?.isHost;
  const link = inviteLink(room.code);
  const seats = Array.from({ length: room.maxPlayers }, (_, i) => room.members[i] ?? null);
  const canStart = room.members.length >= 2;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(link);
    }
  };

  return (
    <main className="home">
      <section className="home-card lobby">
        <div className="lobby-head">
          <h1 className="logo">{T.appName}</h1>
          <button className="btn ghost small" onClick={leaveRoom}>
            {T.leave}
          </button>
        </div>

        <div className="invite">
          <div className="invite-code">
            <small>{T.roomCode}</small>
            <b data-testid="room-code">{room.code}</b>
          </div>
          <div className="invite-body">
            <h2>{T.inviteTitle}</h2>
            <p className="muted small">{T.inviteHelp}</p>
            <div className="linkrow">
              <input readOnly value={link} aria-label="Link mời" onFocus={(e) => e.currentTarget.select()} />
              <button className="btn primary small" onClick={copy}>
                {copied ? T.copied : T.copyLink}
              </button>
              {typeof navigator.share === 'function' && (
                <button className="btn small" onClick={() => void navigator.share({ title: T.appName, text: T.shareText(room.code), url: link }).catch(() => {})}>
                  {T.share}
                </button>
              )}
            </div>
          </div>
        </div>

        <h2 className="seats-title">
          {T.seats} <span className="muted">{room.members.length}/{room.maxPlayers}</span>
        </h2>
        <ul className="seats">
          {seats.map((m, i) => (
            <li key={m?.id ?? `empty-${i}`} className={m ? 'seat' : 'seat empty'}>
              <i className="dot" style={{ background: m ? SEAT_STYLE[i].accent : 'transparent' }} />
              {m ? (
                <>
                  <span className="seat-name">
                    {m.name}
                    {m.id === room.you && <em> ({T.you})</em>}
                  </span>
                  <span className="tags">
                    {m.isHost && <span className="tag host">{T.host}</span>}
                    {m.isBot && <span className="tag">{T.bot}</span>}
                    {!m.connected && <span className="tag warn">{T.offline}</span>}
                  </span>
                  {isHost && m.id !== room.you && (
                    <button className="btn ghost small" onClick={() => void removeMember(m.id)}>
                      {T.remove}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="seat-name muted">{T.emptySeat}</span>
                  {isHost && (
                    <button className="btn ghost small" onClick={() => void addBot()}>
                      + {T.addBot}
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>

        {isHost ? (
          <>
            <button className="btn primary wide" disabled={!canStart} onClick={() => void startGame()}>
              {T.start}
            </button>
            {!canStart && <p className="muted small center">{T.needTwo}</p>}
          </>
        ) : (
          <p className="muted center waiting">{T.waitingHost}</p>
        )}
      </section>
    </main>
  );
}
