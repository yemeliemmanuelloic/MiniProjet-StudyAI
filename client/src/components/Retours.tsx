import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useI18n } from '../lib/i18n';

/**
 * Retours d'action : notifications breves et fenetre de confirmation
 * (20 octobre).
 *
 * NOTIFICATIONS. Ajouter ou supprimer un cours ne disait rien : la liste
 * changeait, sans un mot. Une notification breve confirme l'action. Elle est
 * annoncee aux lecteurs d'ecran (role="status", aria-live polite), disparait
 * seule apres quelques secondes et peut etre fermee.
 *
 * CONFIRMATION. `window.confirm` affichait une boite grise du navigateur,
 * hors de la charte, sans bouton rouge pour l'action destructrice. L'element
 * natif <dialog> ouvert par showModal() apporte gratuitement ce qu'il faut :
 * le focus piege dans la fenetre, la touche Echap, le fond inerte.
 */

type Ton = 'succes' | 'info' | 'erreur';

interface Notification {
  id: number;
  message: string;
  ton: Ton;
}

interface DemandeConfirmation {
  titre: string;
  message: string;
  action: string;
  danger?: boolean;
}

interface Contexte {
  notifier(message: string, ton?: Ton): void;
  confirmer(demande: DemandeConfirmation): Promise<boolean>;
}

const RetoursContext = createContext<Contexte | null>(null);
const DUREE_MS = 4500;

export function RetoursProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [demande, setDemande] = useState<DemandeConfirmation | null>(null);
  const resoudre = useRef<((ok: boolean) => void) | null>(null);
  const fenetre = useRef<HTMLDialogElement>(null);
  const suivant = useRef(0);

  const retirer = useCallback((id: number) => {
    setNotifications((liste) => liste.filter((n) => n.id !== id));
  }, []);

  const notifier = useCallback(
    (message: string, ton: Ton = 'succes') => {
      const id = ++suivant.current;
      // Trois au plus : au-dela, elles masqueraient la page.
      setNotifications((liste) => [...liste.slice(-2), { id, message, ton }]);
      window.setTimeout(() => retirer(id), DUREE_MS);
    },
    [retirer],
  );

  const confirmer = useCallback((d: DemandeConfirmation) => {
    setDemande(d);
    return new Promise<boolean>((ok) => {
      resoudre.current = ok;
    });
  }, []);

  useEffect(() => {
    const el = fenetre.current;
    if (!el) return;
    if (demande && !el.open) el.showModal();
    if (!demande && el.open) el.close();
  }, [demande]);

  function repondre(ok: boolean) {
    resoudre.current?.(ok);
    resoudre.current = null;
    setDemande(null);
  }

  const valeur = useMemo(() => ({ notifier, confirmer }), [notifier, confirmer]);

  return (
    <RetoursContext.Provider value={valeur}>
      {children}

      <div className="notifications" role="status" aria-live="polite">
        {notifications.map((n) => (
          <div key={n.id} className={`notification notification-${n.ton}`}>
            <span>{n.message}</span>
            <button type="button" aria-label={t('retours.fermer')} onClick={() => retirer(n.id)}>
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Echap ferme la fenetre native : l'evenement « cancel » vaut refus. */}
      <dialog
        ref={fenetre}
        className="confirmation"
        aria-labelledby="confirmation-titre"
        onCancel={(e) => {
          e.preventDefault();
          repondre(false);
        }}
      >
        {demande && (
          <>
            <h2 id="confirmation-titre">{demande.titre}</h2>
            <p>{demande.message}</p>
            <div className="confirmation-actions">
              {/* Le focus initial va sur « Annuler » (premier bouton) : une
                  touche Entree distraite ne declenche pas l'action. */}
              <button type="button" className="bouton bouton-secondaire" onClick={() => repondre(false)}>
                {t('retours.annuler')}
              </button>
              <button
                type="button"
                className={`bouton${demande.danger ? ' bouton-danger' : ''}`}
                onClick={() => repondre(true)}
              >
                {demande.action}
              </button>
            </div>
          </>
        )}
      </dialog>
    </RetoursContext.Provider>
  );
}

export function useRetours(): Contexte {
  const c = useContext(RetoursContext);
  if (!c) throw new Error('useRetours doit etre utilise dans un RetoursProvider');
  return c;
}
