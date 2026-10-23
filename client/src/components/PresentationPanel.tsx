import { useCallback, useEffect, useRef, useState } from 'react';
import { Citation } from './SourceCours';
import { Bouton, Chargement, ErreurApi, EtatVide } from './ui';
import { api, apiAudio, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type { Presentation } from '../lib/types';

/**
 * Presentation narree du cours (decisions 044 et 045).
 *
 * Une courte « video » pedagogique : des diapositives qui s'enchainent, lues a
 * voix haute. Le SCRIPT vient du serveur (un appel au modele, ancre dans le
 * cours, chaque scene citant son passage).
 *
 * La VOIX est naturelle par defaut : le serveur la produit a la premiere
 * ecoute de chaque scene (synthese vocale Gemini), puis la conserve. La voix
 * de l'appareil (Web Speech API) est le secours, scene par scene : quand le
 * serveur repond 204 (donnee personnelle dans la narration), echoue ou n'est
 * pas joignable. Sans aucune voix, les sous-titres suffisent : on avance a la
 * main.
 *
 * Deux modes : « Vidéo » (diapositives + voix) et « Audio » (le meme texte a
 * ecouter, sans regarder l'ecran).
 */

const VITESSES = [0.85, 1, 1.15, 1.3];

type Voix = 'naturelle' | 'appareil';

function voixFrancaise(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voix = window.speechSynthesis.getVoices();
  return voix.find((v) => v.lang.toLowerCase().startsWith('fr')) ?? voix[0] ?? null;
}

export function PresentationPanel({ coursId }: { coursId: string }) {
  const { t } = useI18n();
  const [presentation, setPresentation] = useState<Presentation | null | undefined>(undefined);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<ApiError | null>(null);

  useEffect(() => {
    api<{ presentation: Presentation | null }>(`/courses/${coursId}/presentation`)
      .then((d) => setPresentation(d.presentation))
      .catch((e) => {
        setPresentation(null);
        setErreur(e as ApiError);
      });
  }, [coursId]);

  async function generer() {
    setErreur(null);
    setEnCours(true);
    try {
      const d = await api<{ presentation: Presentation }>(`/courses/${coursId}/presentation`, {
        method: 'POST',
      });
      setPresentation(d.presentation);
    } catch (e) {
      setErreur(e as ApiError);
    } finally {
      setEnCours(false);
    }
  }

  if (presentation === undefined) return <Chargement lignes={3} />;

  return (
    <div className="pile">
      <ErreurApi erreur={erreur} onReessayer={generer} />

      {enCours && (
        <div className="carte pile">
          <Chargement lignes={4} message={t('presentation.encours')} />
        </div>
      )}

      {!presentation && !enCours && (
        <EtatVide
          titre={t('presentation.vide')}
          action={<Bouton onClick={generer}>{t('presentation.action')}</Bouton>}
        >
          {t('presentation.vide.corps')}
        </EtatVide>
      )}

      {presentation && !enCours && (
        <>
          <Lecteur key={presentation.id} coursId={coursId} presentation={presentation} />
          <div className="ligne">
            <Bouton secondaire onClick={generer}>
              {t('presentation.regenerer')}
            </Bouton>
          </div>
        </>
      )}
    </div>
  );
}

function Lecteur({ coursId, presentation }: { coursId: string; presentation: Presentation }) {
  const { t } = useI18n();
  const { titre, scenes } = presentation.payload;
  const [rang, setRang] = useState(0);
  const [lecture, setLecture] = useState(false);
  const [mode, setMode] = useState<'video' | 'audio'>('video');
  const [vitesse, setVitesse] = useState(1);
  const [choixVoix, setChoixVoix] = useState<Voix>('naturelle');
  const [preparation, setPreparation] = useState(false);
  const [voixLocale, setVoixLocale] = useState<SpeechSynthesisVoice | null>(() => voixFrancaise());
  const synthese = 'speechSynthesis' in window;
  // Chaque lecture recoit un numero : la fin d'une phrase interrompue (pause,
  // scene suivante) ne doit pas faire avancer la presentation. Certains
  // navigateurs declenchent « end » meme sur une annulation.
  const jeton = useRef(0);
  const lecteurAudio = useRef<HTMLAudioElement | null>(null);
  // Scene dont l'audio est charge : une pause puis une reprise sur la meme
  // scene repartent de la ou l'on s'etait arrete.
  const sceneChargee = useRef<number | null>(null);
  // Une promesse par scene : la voix n'est demandee qu'une fois, et la scene
  // suivante se prepare pendant que l'on ecoute la courante.
  const voixServeur = useRef(new Map<number, Promise<string | null>>());

  // Les voix arrivent apres le chargement de la page dans certains navigateurs.
  useEffect(() => {
    if (!synthese) return;
    const charger = () => setVoixLocale(voixFrancaise());
    window.speechSynthesis.addEventListener('voiceschanged', charger);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', charger);
  }, [synthese]);

  // On coupe la voix en quittant l'onglet ou la page, et on libere les audios.
  useEffect(() => {
    const cache = voixServeur.current;
    return () => {
      jeton.current++;
      if (synthese) window.speechSynthesis.cancel();
      lecteurAudio.current?.pause();
      cache.forEach((p) => p.then((url) => url && URL.revokeObjectURL(url)));
    };
  }, [synthese]);

  useEffect(() => {
    if (lecteurAudio.current) lecteurAudio.current.playbackRate = vitesse;
  }, [vitesse]);

  const voixDe = useCallback(
    (indice: number): Promise<string | null> => {
      const cache = voixServeur.current;
      let promesse = cache.get(indice);
      if (!promesse) {
        promesse = apiAudio(`/courses/${coursId}/presentation/${presentation.id}/voice/${indice}`)
          .then((blob) => (blob ? URL.createObjectURL(blob) : null))
          .catch(() => {
            // Un echec passager (quota, reseau) ne condamne pas la scene :
            // la prochaine ecoute redemandera la voix naturelle.
            cache.delete(indice);
            return null;
          });
        cache.set(indice, promesse);
      }
      return promesse;
    },
    [coursId, presentation.id],
  );

  const arreter = useCallback(() => {
    if (synthese) window.speechSynthesis.cancel();
    lecteurAudio.current?.pause();
  }, [synthese]);

  const dire = useCallback(
    (indice: number) => {
      arreter();
      const numero = ++jeton.current;
      const suite = () => {
        // Fin de scene : on enchaine, sauf a la derniere.
        if (jeton.current !== numero) return;
        if (indice < scenes.length - 1) {
          setRang(indice + 1);
          dire(indice + 1);
        } else {
          setLecture(false);
        }
      };

      const direLocalement = () => {
        if (!synthese) return;
        const phrase = new SpeechSynthesisUtterance(scenes[indice].narration);
        if (voixLocale) phrase.voice = voixLocale;
        phrase.lang = voixLocale?.lang ?? 'fr-FR';
        phrase.rate = vitesse;
        phrase.onend = suite;
        window.speechSynthesis.speak(phrase);
      };

      if (choixVoix === 'appareil') {
        direLocalement();
        return;
      }

      setPreparation(true);
      voixDe(indice).then((url) => {
        if (jeton.current !== numero) return;
        setPreparation(false);
        if (indice < scenes.length - 1) void voixDe(indice + 1);
        if (!url) {
          direLocalement();
          return;
        }
        const audio = lecteurAudio.current ?? new Audio();
        lecteurAudio.current = audio;
        audio.src = url;
        audio.playbackRate = vitesse;
        audio.onended = suite;
        sceneChargee.current = indice;
        audio.play().catch(direLocalement);
      });
    },
    [arreter, choixVoix, scenes, synthese, vitesse, voixDe, voixLocale],
  );

  function basculer() {
    if (lecture) {
      jeton.current++;
      arreter();
      setPreparation(false);
      setLecture(false);
      return;
    }
    setLecture(true);
    const audio = lecteurAudio.current;
    const reprise =
      choixVoix === 'naturelle' &&
      audio &&
      sceneChargee.current === rang &&
      audio.currentTime > 0 &&
      !audio.ended;
    if (!reprise) {
      dire(rang);
      return;
    }
    const numero = ++jeton.current;
    audio.onended = () => {
      if (jeton.current !== numero) return;
      if (rang < scenes.length - 1) {
        setRang(rang + 1);
        dire(rang + 1);
      } else {
        setLecture(false);
      }
    };
    audio.play().catch(() => dire(rang));
  }

  function aller(indice: number) {
    const borne = Math.max(0, Math.min(scenes.length - 1, indice));
    setRang(borne);
    sceneChargee.current = null;
    if (lecture) dire(borne);
    else {
      jeton.current++;
      arreter();
    }
  }

  function changerVoix(v: Voix) {
    setChoixVoix(v);
    jeton.current++;
    arreter();
    sceneChargee.current = null;
    setPreparation(false);
    setLecture(false);
  }

  const scene = scenes[rang];
  const aucuneVoix = !synthese && choixVoix === 'appareil';

  return (
    <section className="lecteur" aria-label={titre}>
      <div className="lecteur-barre">
        <strong className="lecteur-titre">{titre}</strong>
        <div className="lecteur-modes" role="group" aria-label={t('presentation.mode')}>
          {(['video', 'audio'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`lecteur-mode${mode === m ? ' actif' : ''}`}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {t(m === 'video' ? 'presentation.mode.video' : 'presentation.mode.audio')}
            </button>
          ))}
        </div>
      </div>

      {mode === 'video' && (
        <div className="lecteur-scene" key={rang}>
          <p className="lecteur-numero">
            {t('presentation.scene', { i: rang + 1, n: scenes.length })}
          </p>
          <h3>{scene.titre}</h3>
          <ul>
            {scene.points.map((p, i) => (
              <li key={p} style={{ animationDelay: `${150 + i * 350}ms` }}>
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sous-titres : toujours affiches, c'est aussi ce qui rend la
          presentation utilisable sans le son. */}
      <p className="lecteur-soustitre" aria-live="polite">
        {mode === 'audio' && <strong>{scene.titre} — </strong>}
        {scene.narration}
      </p>

      <div className="lecteur-commandes">
        <button type="button" className="lecteur-btn" onClick={() => aller(rang - 1)} disabled={rang === 0} aria-label={t('presentation.precedente')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <button type="button" className="lecteur-btn lecteur-lire" onClick={basculer} disabled={aucuneVoix} aria-label={lecture ? t('presentation.pause') : t('presentation.lire')}>
          {lecture ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <button type="button" className="lecteur-btn" onClick={() => aller(rang + 1)} disabled={rang === scenes.length - 1} aria-label={t('presentation.suivante')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>

        <div className="lecteur-progression" aria-hidden="true">
          {scenes.map((s, i) => (
            <span key={s.titre + i} className={i === rang ? 'actif' : i < rang ? 'vu' : ''} />
          ))}
        </div>

        <label className="lecteur-vitesse">
          <span>{t('presentation.voix')}</span>
          <select value={choixVoix} onChange={(e) => changerVoix(e.target.value as Voix)}>
            <option value="naturelle">{t('presentation.voix.naturelle')}</option>
            <option value="appareil">{t('presentation.voix.appareil')}</option>
          </select>
        </label>

        <label className="lecteur-vitesse">
          <span>{t('presentation.vitesse')}</span>
          <select value={vitesse} onChange={(e) => setVitesse(Number(e.target.value))}>
            {VITESSES.map((v) => (
              <option key={v} value={v}>
                {v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}×
              </option>
            ))}
          </select>
        </label>
      </div>

      {preparation && <p className="petit discret" role="status">{t('presentation.voixPreparation')}</p>}
      {aucuneVoix && <p className="petit discret">{t('presentation.sansVoix')}</p>}
      <p className="petit discret">
        {t(choixVoix === 'naturelle' ? 'presentation.voixNaturelle' : 'presentation.voixLocale')}
      </p>

      <Citation passage={scene.citation}>{scene.citation}</Citation>
    </section>
  );
}
