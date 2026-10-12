import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bouton, Champ, ErreurApi } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

function Encadre({ titre, sous, children }: { titre: string; sous: string; children: ReactNode }) {
  return (
    <main className="page" style={{ maxWidth: 440 }}>
      <div className="carte pile">
        <div>
          <h1 style={{ fontSize: 22 }}>{titre}</h1>
          <p className="discret" style={{ margin: 0 }}>
            {sous}
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}

export function ConnexionPage() {
  const { connecter } = useAuth();
  const navigate = useNavigate();
  const emplacement = useLocation();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await connecter(email, motDePasse);
      const retour = (emplacement.state as { de?: string } | null)?.de;
      navigate(retour ?? '/cours', { replace: true });
    } catch (err) {
      setErreur(err as ApiError);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Encadre titre="Se connecter" sous="Retrouvez vos cours et vos revisions.">
      <form className="pile" onSubmit={soumettre}>
        <Champ
          libelle="Adresse electronique"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Champ
          libelle="Mot de passe"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
        />
        <ErreurApi erreur={erreur} />
        <Bouton type="submit" disabled={envoi}>
          {envoi ? 'Connexion…' : 'Se connecter'}
        </Bouton>
      </form>
      <p className="petit discret" style={{ margin: 0 }}>
        Pas encore de compte ? <Link to="/inscription">Creer un compte</Link>
      </p>
    </Encadre>
  );
}

export function InscriptionPage() {
  const { inscrire } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await inscrire(email, motDePasse);
      navigate('/cours', { replace: true });
    } catch (err) {
      setErreur(err as ApiError);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Encadre titre="Creer un compte" sous="Importez vos cours, StudyAI vous aide a reviser.">
      <form className="pile" onSubmit={soumettre}>
        <Champ
          libelle="Adresse electronique"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Champ
          libelle="Mot de passe"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="8 caracteres minimum"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
        />
        <ErreurApi erreur={erreur} />
        <Bouton type="submit" disabled={envoi}>
          {envoi ? 'Creation…' : 'Creer mon compte'}
        </Bouton>
      </form>
      <p className="petit discret" style={{ margin: 0 }}>
        Deja inscrit ? <Link to="/connexion">Se connecter</Link>
      </p>
    </Encadre>
  );
}
