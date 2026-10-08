/**
 * Das Lager: zwischen den Abenteuern. Hier waehlt man die Klasse, schaltet
 * mit Ruhm Neues frei, stellt die Heldenstufe ein und bricht auf - zu einem
 * neuen Abenteuer oder zum Tagesabenteuer (gleiche Welt fuer alle, ein
 * Bestwert je Tag).
 */

import { AKTE, HELDENSTUFE_REGEL, KLASSEN, OMEN, START_EXTRAS, gegenstand, omenFuer } from '../../abenteuer/regeln';
import type { KlasseId } from '../../abenteuer/regeln';
import { FigurBild } from './DebugFenster';
import { ERFOLGE, FREISCHALTUNGEN, freischalten, heute, istFrei } from './meta';
import type { FreiArt } from './meta';
import type { Meta } from './meta';

export type Aufbruch = { klasse: KlasseId; stufe: number; tag?: { tag: string; seed: number } };

export function Lager({ meta, onMeta, onAufbruch, onZurueck }: { meta: Meta; onMeta: (m: Meta) => void; onAufbruch: (x: Aufbruch) => void; onZurueck?: () => void }) {
  const klassen = Object.keys(KLASSEN) as KlasseId[];
  const kosten = (art: FreiArt, id: string) => FREISCHALTUNGEN.find((f) => f.art === art && f.id === id)?.kosten ?? 0;
  const tag = heute();
  const tagBest = meta.tage[tag.tag];
  return (
    <div className="ab-ende ab-lager-huelle">
      <div className="ab-fenster ab-lager">
        <div className="ab-lager-kopf">
          <h2>Das Lager</h2>
          <span className="ab-ruhm" title="Ruhm bekommst du fuer jedes Abenteuer - je weiter du kommst, desto mehr.">
            ★ {meta.ruhm} Ruhm
          </span>
          {onZurueck && (
            <button className="klein" onClick={onZurueck} title="Zurueck zum laufenden Abenteuer">
              ×
            </button>
          )}
        </div>
        <p className="ab-lager-ziel">
          Ziel: {AKTE} Akte - in jedem erwacht ein Boss, der dritte ist der Endboss. Ruhm aus jedem Abenteuer schaltet hier Neues frei.
        </p>

        <small>Klasse</small>
        <div className="ab-klassen">
          {klassen.map((k) => {
            const frei = istFrei(meta, 'klasse', k);
            const gewaehlt = meta.klasse === k;
            const kl = KLASSEN[k];
            return (
              <button
                key={k}
                className={['ab-klasse', gewaehlt ? 'gewaehlt' : '', frei ? '' : 'zu'].filter(Boolean).join(' ')}
                onClick={() => (frei ? onMeta({ ...meta, klasse: k }) : onMeta(freischalten(meta, 'klasse', k)))}
                disabled={!frei && meta.ruhm < kosten('klasse', k)}
                title={kl.text}
              >
                <FigurBild id={kl.figur} waffe={kl.ausruestung.waffe ?? 'schwert'} />
                <b>{kl.name}</b>
                <span>{kl.text}</span>
                {!frei && <em>★ {kosten('klasse', k)} freischalten</em>}
              </button>
            );
          })}
        </div>

        <small>Mitgift (gilt bei jedem Aufbruch)</small>
        <div className="ab-extras">
          {FREISCHALTUNGEN.filter((f) => f.art === 'extra').map((f) => {
            const frei = istFrei(meta, 'extra', f.id);
            return (
              <button
                key={f.id}
                className={frei ? 'ab-extra frei' : 'ab-extra'}
                disabled={frei || meta.ruhm < f.kosten}
                onClick={() => onMeta(freischalten(meta, 'extra', f.id))}
                title={START_EXTRAS[f.id]?.text}
              >
                <b>{frei ? '✓ ' : ''}{START_EXTRAS[f.id]?.name}</b>
                <span>{START_EXTRAS[f.id]?.text}</span>
                {!frei && <em>★ {f.kosten}</em>}
              </button>
            );
          })}
        </div>

        <small>Legendaeres (kommt danach in Truhen, Schaetzen und Bossbeute vor)</small>
        <div className="ab-extras">
          {FREISCHALTUNGEN.filter((f) => f.art === 'legende').map((f) => {
            const frei = istFrei(meta, 'legende', f.id);
            const g = gegenstand(f.id);
            return (
              <button
                key={f.id}
                className={frei ? 'ab-extra frei legendaer' : 'ab-extra legendaer'}
                disabled={frei || meta.ruhm < f.kosten}
                onClick={() => onMeta(freischalten(meta, 'legende', f.id))}
                title={g?.text}
              >
                <b>
                  {frei ? '✓ ' : ''}
                  {g?.name}
                </b>
                <span>{g?.text.replace(/^Legendaer\.\s*/, '')}</span>
                {!frei && <em>★ {f.kosten}</em>}
              </button>
            );
          })}
        </div>

        {meta.stufeMax > 0 && (
          <div className="ab-heldenstufe">
            <small>Heldenstufe</small>
            <button className="klein" disabled={meta.stufe <= 0} onClick={() => onMeta({ ...meta, stufe: meta.stufe - 1 })}>
              −
            </button>
            <b>{meta.stufe}</b>
            <button className="klein" disabled={meta.stufe >= meta.stufeMax} onClick={() => onMeta({ ...meta, stufe: meta.stufe + 1 })}>
              +
            </button>
            <span>
              {meta.stufe === 0
                ? 'normal'
                : `${HELDENSTUFE_REGEL.slice(1, meta.stufe + 1).join(' ')} Gegner kommen oefter. Punkte ×${(1 + 0.3 * meta.stufe).toFixed(1)}`}
            </span>
          </div>
        )}

        <small>
          Erfolge ({meta.erfolge.length}/{ERFOLGE.length})
        </small>
        <div className="ab-erfolge">
          {ERFOLGE.map((e) => (
            <span key={e.id} className={meta.erfolge.includes(e.id) ? 'ab-erfolg da' : 'ab-erfolg'} title={`${e.text} +${e.ruhm} Ruhm`}>
              {meta.erfolge.includes(e.id) ? '★' : '☆'} <b>{e.name}</b> <i>{e.text}</i> <em>+{e.ruhm}</em>
            </span>
          ))}
        </div>

        <div className="ab-lager-knoepfe">
          <button className="primary" onClick={() => onAufbruch({ klasse: meta.klasse, stufe: meta.stufe })}>
            Aufbrechen als {KLASSEN[meta.klasse].name}
          </button>
          <button
            onClick={() => onAufbruch({ klasse: 'ritter', stufe: 0, tag })}
            title={`Dieselbe Welt fuer alle - heute. Immer als Ritter, ohne Mitgift und Heldenstufe. Vorzeichen: ${OMEN[omenFuer(tag.seed)].name} - ${OMEN[omenFuer(tag.seed)].text}`}
          >
            Tagesabenteuer {tag.tag}
            {tagBest ? ` (Bestwert ${tagBest})` : ''}
            <small className="ab-tag-info">Ritter ohne Mitgift · Vorzeichen: {OMEN[omenFuer(tag.seed)].name}</small>
          </button>
        </div>
        <p className="ab-lager-stat">
          {meta.laeufe} Abenteuer · {meta.siege} Siege · Bestwert {meta.bester}
        </p>
      </div>
    </div>
  );
}
