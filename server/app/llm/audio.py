"""
Encodage de la voix de la presentation narree (decision 045).

Le modele livre du PCM 16 bits mono, enveloppe en WAV ou brut (« audio/L16;
rate=24000 »). On le ramene a du PCM, puis on l'encode en MP3 : 18 secondes de
narration passent de 860 Ko a un peu plus de 100 Ko, ce qui rend le stockage
en base raisonnable.
"""

from __future__ import annotations

import io
import re
import wave

import lameenc

FREQUENCE_PAR_DEFAUT = 24_000
DEBIT_KBPS = 48


def vers_pcm(donnees: bytes, type_mime: str) -> tuple[bytes, int]:
    """PCM 16 bits mono et sa frequence, quelle que soit l'enveloppe livree."""
    if donnees[:4] == b"RIFF":
        with wave.open(io.BytesIO(donnees)) as fichier:
            pcm = fichier.readframes(fichier.getnframes())
            frequence = fichier.getframerate()
        # Le modele a livre une seconde en-tete WAV dans les donnees : on la
        # retire, sinon elle s'entend comme un claquement au debut.
        if pcm[:4] == b"RIFF":
            return vers_pcm(pcm, type_mime)
        return pcm, frequence
    trouve = re.search(r"rate=(\d+)", type_mime)
    return donnees, int(trouve.group(1)) if trouve else FREQUENCE_PAR_DEFAUT


def en_mp3(pcm: bytes, frequence: int) -> bytes:
    encodeur = lameenc.Encoder()
    encodeur.set_bit_rate(DEBIT_KBPS)
    encodeur.set_in_sample_rate(frequence)
    encodeur.set_channels(1)
    encodeur.set_quality(2)
    return bytes(encodeur.encode(pcm) + encodeur.flush())
