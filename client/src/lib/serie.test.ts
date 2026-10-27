import { describe, expect, it } from 'vitest';
import { joursActifs, semaine, serie } from './serie';

/** Jeudi 23 octobre 2026, 15 h, heure locale. */
const JEUDI = new Date(2026, 9, 23, 15, 0, 0);
const jours = (...cles: string[]) => new Set(cles);

describe('serie', () => {
  it('compte les jours consecutifs jusqu’a aujourd’hui', () => {
    const s = serie(jours('2026-10-21', '2026-10-22', '2026-10-23'), JEUDI);
    expect(s).toEqual({ actuelle: 3, record: 3, aujourdhui: true });
  });

  it('reste vivante si l’on n’a pas encore revise aujourd’hui', () => {
    const s = serie(jours('2026-10-21', '2026-10-22'), JEUDI);
    expect(s.actuelle).toBe(2);
    expect(s.aujourdhui).toBe(false);
  });

  it('tombe a zero apres un jour sans revision', () => {
    expect(serie(jours('2026-10-20', '2026-10-21'), JEUDI).actuelle).toBe(0);
  });

  it('garde le record d’une ancienne serie', () => {
    const s = serie(jours('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-23'), JEUDI);
    expect(s.actuelle).toBe(1);
    expect(s.record).toBe(4);
  });

  it('traverse un changement de mois', () => {
    const s = serie(jours('2026-09-30', '2026-10-01'), new Date(2026, 9, 1, 9));
    expect(s.actuelle).toBe(2);
  });

  it('aucune activite', () => {
    expect(serie(new Set(), JEUDI)).toEqual({ actuelle: 0, record: 0, aujourdhui: false });
  });
});

describe('semaine', () => {
  it('va du lundi au dimanche, et marque les jours a venir', () => {
    const s = semaine(jours('2026-10-20', '2026-10-23'), JEUDI);
    expect(s.map((j) => j.cle)).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ]);
    expect(s.filter((j) => j.actif).map((j) => j.cle)).toEqual(['2026-10-20', '2026-10-23']);
    expect(s.filter((j) => j.futur).map((j) => j.cle)).toEqual(['2026-10-24', '2026-10-25']);
  });

  it('un dimanche appartient a la semaine qui se termine', () => {
    expect(semaine(new Set(), new Date(2026, 9, 25, 10))[0].cle).toBe('2026-10-19');
  });
});

describe('joursActifs', () => {
  it('compte en heure locale et ignore les dates invalides', () => {
    const local = new Date(2026, 9, 23, 0, 30);
    expect(joursActifs([local.toISOString(), 'pas une date'])).toEqual(new Set(['2026-10-23']));
  });
});
