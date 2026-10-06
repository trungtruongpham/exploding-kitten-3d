import type { ClientView, GameEvent } from '@meobom/engine';
import { CARD_NAMES, POS_LABEL } from '../i18n';

/** One Vietnamese log line per event, or null for events that don't need one. */
export function logLine(e: GameEvent, v: ClientView): string | null {
  const name = (id: string) => (id === v.you ? 'Bạn' : (v.players.find((p) => p.id === id)?.name ?? '?'));
  switch (e.kind) {
    case 'dealt':
      return `Đã chia 7 lá và 1 Cắt Ngòi cho ${e.players.length} người. Có ${e.fuses} Mèo Bom ẩn trong chồng bài.`;
    case 'played':
      return e.cards.length === 2
        ? `${name(e.actor)} đánh đôi ${CARD_NAMES[e.type]}${e.target ? ` vào ${name(e.target)}` : ''}.`
        : `${name(e.actor)} đánh ${CARD_NAMES[e.type]}${e.target ? ` vào ${name(e.target)}` : ''}.`;
    case 'hissed':
      return `${name(e.player)} khè!`;
    case 'resolved':
      if (e.canceled) return `${CARD_NAMES[e.type]} của ${name(e.actor)} đã bị hủy.`;
      if (e.type === 'catnap') return `${name(e.actor)} cuộn tròn ngủ, không rút bài.`;
      return null;
    case 'drew':
      return e.card ? `Bạn rút được lá ${CARD_NAMES[e.card.type]}.` : `${name(e.player)} rút một lá.`;
    case 'fuseDrawn':
      return `${name(e.player)} rút trúng Mèo Bom!`;
    case 'defused':
      return `${name(e.player)} đã cắt ngòi.`;
    case 'inserted': {
      if (e.player !== v.you || e.position === undefined) return `${name(e.player)} giấu Mèo Bom lại vào chồng bài.`;
      const n = v.deckCount - 1;
      const where = e.position === 0 ? 'top' : e.position === 1 ? 'second' : e.position >= n ? 'bottom' : null;
      return where ? `Bạn giấu Mèo Bom ${POS_LABEL[where]}.` : `Bạn giấu Mèo Bom ở lá thứ ${e.position + 1} từ trên xuống.`;
    }
    case 'exploded':
      return e.player === v.you ? 'Bạn nổ tung rồi!' : `${name(e.player)} nổ tung!`;
    case 'shuffled':
      return `${name(e.player)} xáo chồng bài.`;
    case 'peeked':
      return `${name(e.player)} nhìn trộm 3 lá trên cùng.`;
    case 'gave':
      if (e.stolen) return e.card ? `${name(e.to)} cướp lá ${CARD_NAMES[e.card.type]} của ${name(e.from).toLowerCase() === 'bạn' ? 'bạn' : name(e.from)}.` : `${name(e.to)} cướp một lá của ${name(e.from)}.`;
      return e.card ? `${name(e.from)} đưa lá ${CARD_NAMES[e.card.type]} cho ${name(e.to).toLowerCase() === 'bạn' ? 'bạn' : name(e.to)}.` : `${name(e.from)} đưa một lá cho ${name(e.to)}.`;
    case 'turn':
      return e.pending > 1 ? `${name(e.player)} phải đi ${e.pending} lượt.` : null;
    case 'win':
      return e.player === v.you ? 'Bạn thắng ván này!' : `${name(e.player)} thắng ván này!`;
  }
}
