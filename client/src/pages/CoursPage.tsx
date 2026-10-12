import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alerte, Bouton, Champ, ErreurApi, EtatVide, Pastille } from '../components/ui';
import { api, ApiError } from '../lib/api';
import type { Cours, CoursResume } from '../lib/types';

/**
 * Bibliotheque de cours de l'etudiant.
 *
 * Deux voies d'entree volontairement distinctes :
 *   - le collage de texte, qui marche toujours et ne depend de rien ;
 *   - l'import PDF, plus confortable mais qui echoue sur un scan.
 * La seconde ne remplace pas la premiere : le jour de la demonstration, un PDF
 * recalcitrant ne doit pas bloquer la seance.
 *
 * Aucun appel au modele ici. Creer un cours, c'est enregistrer du texte ; les
 * trois modules IA ne se declenchent que depuis la fiche du cours.
 */

const MIN_CARACTERES = 200;

function formaterDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function CoursPage() {
  const [cours, setCours] = useState<CoursResume[] | null>(null);
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);

  useEffect(() => {
    api<{ courses: CoursResume[] }>('/courses')
      .then((d) => setCours(d.courses))
      .catch((e) => {
        setErreur(e as ApiError);
        setCours([]);
      });
  }, []);

  function ajouter(nouveau: Cours) {
    setCours((liste) => [
      { ...nouveau, _count: { summaries: 0, quizzes: 0, messages: 0 } },
      ...(liste ?? []),
    ]);
    setFormulaireOuvert(false);
  }

  async function supprimer(id: string, titre: string) {
    const question = `Supprimer "${titre}" ? Les resumes, quiz et echanges seront perdus.`;
    if (!window.confirm(question)) return;

    setErreur(null);
    try {
      await api<void>(`/courses/${id}`, { method: 'DELETE' });
      setCours((liste) => (liste ?? []).filter((c) => c.id !== id));
    } catch (e) {
      setErreur(e as ApiError);
    }
  }

  return (
    <main className="page pile">
      <div className="ligne">
        <div>
          <h1>Mes cours</h1>
          <p className="discret" style={{ margin: 0 }}>
            Importez un support de cours : StudyAI le resume, vous interroge et repond a vos
            questions.
          </p>
        </div>
        <div className="pousse">
          <Bouton onClick={() => setFormulaireOuvert((o) => !o)} secondaire={formulaireOuvert}>
            {formulaireOuvert ? 'Annuler' : 'Ajouter un cours'}
          </Bouton>
        </div>
      </div>

      <ErreurApi erreur={erreur} />

      {formulaireOuvert && <FormulaireCours onCree={ajouter} />}

      {cours === null && <p className="discret">Chargement…</p>}

      {cours?.length === 0 && !formulaireOuvert && (
        <EtatVide
          titre="Aucun cours pour le moment"
          action={
            <Bouton onClick={() => setFormulaireOuvert(true)}>Ajouter mon premier cours</Bouton>
          }
        >
          Collez le texte d'un chapitre ou importez un PDF. Il faut au moins {MIN_CARACTERES}{' '}
          caracteres pour que l'analyse ait un sens.
        </EtatVide>
      )}

      {cours?.map((c) => (
        <div key={c.id} className="carte ligne" style={{ gap: 16 }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <Link to={`/cours/${c.id}`} style={{ color: 'inherit' }}>
              <strong style={{ fontSize: 15 }}>{c.title}</strong>
            </Link>
            <div className="ligne petit discret" style={{ gap: 10, marginTop: 4 }}>
              {c.subject && <span>{c.subject}</span>}
              <span>{c.charCount.toLocaleString('fr-FR')} caracteres</span>
              <span>Ajoute le {formaterDate(c.createdAt)}</span>
            </div>
          </div>

          <div className="ligne" style={{ gap: 8 }}>
            {c._count.summaries > 0 && (
              <Pastille ton="marque">
                {c._count.summaries} resume{c._count.summaries > 1 ? 's' : ''}
              </Pastille>
            )}
            {c._count.quizzes > 0 && (
              <Pastille>
                {c._count.quizzes} quiz
              </Pastille>
            )}
            {c._count.messages > 0 && (
              <Pastille>
                {c._count.messages} message{c._count.messages > 1 ? 's' : ''}
              </Pastille>
            )}
          </div>

          <Bouton secondaire onClick={() => supprimer(c.id, c.title)}>
            Supprimer
          </Bouton>
        </div>
      ))}
    </main>
  );
}

/* --- Creation : texte colle ou PDF --- */

function FormulaireCours({ onCree }: { onCree: (cours: Cours) => void }) {
  const [mode, setMode] = useState<'texte' | 'pdf'>('texte');
  const [titre, setTitre] = useState('');
  const [matiere, setMatiere] = useState('');
  const [contenu, setContenu] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<ApiError | null>(null);

  const saisi = contenu.trim().length;
  const tropCourt = mode === 'texte' && saisi > 0 && saisi < MIN_CARACTERES;
  const pretAEnvoyer =
    titre.trim().length >= 3 && (mode === 'texte' ? saisi >= MIN_CARACTERES : fichier !== null);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      if (mode === 'texte') {
        const d = await api<{ course: Cours }>('/courses', {
          body: {
            title: titre.trim(),
            subject: matiere.trim() || undefined,
            content: contenu.trim(),
          },
        });
        onCree(d.course);
      } else {
        const formulaire = new FormData();
        formulaire.append('file', fichier!);
        formulaire.append('title', titre.trim());
        if (matiere.trim()) formulaire.append('subject', matiere.trim());
        const d = await api<{ course: Cours }>('/courses/import', { raw: formulaire });
        onCree(d.course);
      }
    } catch (err) {
      setErreur(err as ApiError);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="carte pile" onSubmit={soumettre}>
      <div className="ligne" style={{ gap: 8 }}>
        <button
          type="button"
          className={`bouton${mode === 'texte' ? '' : ' bouton-secondaire'}`}
          onClick={() => setMode('texte')}
        >
          Coller le texte
        </button>
        <button
          type="button"
          className={`bouton${mode === 'pdf' ? '' : ' bouton-secondaire'}`}
          onClick={() => setMode('pdf')}
        >
          Importer un PDF
        </button>
      </div>

      <div className="ligne" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 260px' }}>
          <Champ
            libelle="Titre du cours"
            name="title"
            required
            placeholder="Chapitre 3 — Ordonnancement"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
          />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <Champ
            libelle="Matiere (facultatif)"
            name="subject"
            placeholder="Systemes d'exploitation"
            value={matiere}
            onChange={(e) => setMatiere(e.target.value)}
          />
        </div>
      </div>

      {mode === 'texte' ? (
        <div className={`champ${tropCourt ? ' champ-erreur' : ''}`}>
          <label htmlFor="contenu">Contenu du cours</label>
          <textarea
            id="contenu"
            rows={10}
            placeholder="Collez ici le texte de votre chapitre…"
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
          />
          <span className={tropCourt ? 'message-erreur' : 'petit discret'}>
            {saisi.toLocaleString('fr-FR')} caracteres
            {tropCourt && ` — il en faut au moins ${MIN_CARACTERES}`}
          </span>
        </div>
      ) : (
        <div className="pile" style={{ gap: 8 }}>
          <div className="champ">
            <label htmlFor="fichier">Fichier PDF</label>
            <input
              id="fichier"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
            />
          </div>
          <Alerte ton="attention">
            Seuls les PDF <strong>a couche texte</strong> sont lisibles. Un cours photographie ou
            scanne ne contient aucun texte : il faut alors le coller a la main.
          </Alerte>
        </div>
      )}

      <ErreurApi erreur={erreur} />

      <div className="ligne">
        <Bouton type="submit" disabled={!pretAEnvoyer || envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer le cours'}
        </Bouton>
        <span className="petit discret">
          Aucun appel au modele a cette etape : le cours est seulement enregistre.
        </span>
      </div>
    </form>
  );
}
