import { useState } from 'react';
import { ROOM_CODE_LENGTH } from '@meobom/engine';
import { T } from '../i18n';
import { createRoom, joinRoom, savedName, useStore } from '../net';
import { CardFan } from './CardFan';

export function Home({ inviteCode }: { inviteCode?: string | null }) {
  const conn = useStore((s) => s.conn);
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(inviteCode ?? '');
  const [busy, setBusy] = useState(false);
  const ready = conn === 'online' && !busy;
  const nameOk = name.trim().length > 0;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <main className="home">
      <section className="home-card">
        <CardFan />
        <h1 className="logo big">{T.appName}</h1>
        <p className="tagline">{T.tagline}</p>

        <label className="field" htmlFor="name">
          <span>{T.yourName}</span>
          <input id="name" value={name} maxLength={16} placeholder={T.namePlaceholder} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
        </label>

        {inviteCode ? (
          <button className="btn primary wide" disabled={!ready || !nameOk} onClick={() => run(() => joinRoom(inviteCode, name.trim()))}>
            {T.join} {inviteCode}
          </button>
        ) : (
          <>
            <button className="btn primary wide" disabled={!ready || !nameOk} onClick={() => run(() => createRoom(name.trim()))}>
              {T.createRoom}
            </button>
            <div className="divider">
              <span>{T.orDivider}</span>
            </div>
            <form
              className="joinrow"
              onSubmit={(e) => {
                e.preventDefault();
                if (ready && nameOk && code.trim().length === ROOM_CODE_LENGTH) void run(() => joinRoom(code, name.trim()));
              }}
            >
              <label className="field grow" htmlFor="code">
                <span>{T.joinTitle}</span>
                <input
                  id="code"
                  value={code}
                  maxLength={ROOM_CODE_LENGTH}
                  placeholder={T.roomCode}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  className="code"
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                />
              </label>
              <button className="btn" type="submit" disabled={!ready || !nameOk || code.length !== ROOM_CODE_LENGTH}>
                {T.join}
              </button>
            </form>
          </>
        )}
        {conn !== 'online' && <p className="muted small">{T.connecting}</p>}
        <p className="muted small howto">{T.howTo}</p>
      </section>
    </main>
  );
}
