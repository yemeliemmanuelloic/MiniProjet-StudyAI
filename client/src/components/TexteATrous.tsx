import { useT } from '../lib/i18n';

/**
 * Un texte a trous (decision 053) : la phrase du cours, le blanc remplace par
 * une zone de saisie. Partage par le quiz et l'examen blanc.
 *
 * Apres correction, la zone se fige et la reponse attendue s'affiche a cote
 * — la tolerance (accents, majuscules, article, faute de frappe) est jugee
 * par le serveur, pas ici.
 */
export function TexteATrous({
  question,
  valeur,
  onChange,
  corrige,
  libelle,
}: {
  question: string;
  valeur: string;
  onChange: (v: string) => void;
  corrige?: { correct: boolean; expected: string | null };
  libelle: string;
}) {
  const t = useT();
  const [avant, ...reste] = question.split(/_{3,}/);
  const apres = reste.join('____');

  return (
    <div className="pile" style={{ gap: 8 }}>
      <p className="trous-phrase">
        {avant}
        <input
          className={`trous-saisie${corrige ? (corrige.correct ? ' trous-juste' : ' trous-faux') : ''}`}
          type="text"
          value={valeur}
          disabled={Boolean(corrige)}
          aria-label={libelle}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          size={Math.max(10, valeur.length + 2)}
          onChange={(e) => onChange(e.target.value)}
        />
        {apres}
      </p>
      {corrige && !corrige.correct && corrige.expected && (
        <span className="petit">
          {t('formats.attendue')} <strong>{corrige.expected}</strong>
        </span>
      )}
    </div>
  );
}
