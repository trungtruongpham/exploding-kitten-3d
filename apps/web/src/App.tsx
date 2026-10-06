import { useEffect, useState } from 'react';
import { loadCardFonts } from './game/cardArt';
import { T } from './i18n';
import { hasTokenFor, roomCodeFromPath, useStore } from './net';
import { GameScreen } from './screens/GameScreen';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function App() {
  const [path, setPath] = useState(location.pathname);
  const [fonts, setFonts] = useState(false);
  const room = useStore((s) => s.room);
  const update = useStore((s) => s.update);
  const conn = useStore((s) => s.conn);
  const t = useStore((s) => s.toast);

  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    window.addEventListener('meobom:navigate', on);
    void loadCardFonts().then(() => setFonts(true));
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('meobom:navigate', on);
    };
  }, []);

  const code = roomCodeFromPath();
  void path;
  let screen: React.ReactNode;
  if (!code) screen = <Home />;
  else if (room && room.code === code) {
    if (room.status === 'lobby') screen = <Lobby />;
    else if (!hasWebGL()) screen = <div className="center-note">{T.webglMissing}</div>;
    else if (update && fonts) screen = <GameScreen />;
    else screen = <div className="center-note">{T.connecting}</div>;
  } else if (hasTokenFor(code)) screen = <div className="center-note">{T.connecting}</div>;
  else screen = <Home inviteCode={code} />;

  return (
    <>
      {screen}
      {conn === 'offline' && <div className="offline">{T.connecting}</div>}
      {t && (
        <div key={t.id} className="toast show" role="status">
          {t.text}
        </div>
      )}
    </>
  );
}
