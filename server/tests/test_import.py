"""
Import d'un support de cours : PDF, Word, PowerPoint.

La route /api/courses/import n'avait AUCUN test avant ce fichier, alors
qu'elle porte deux controles de securite ajoutes le 13 octobre — le refus
d'un fichier trop volumineux et le refus d'un cours trop long. Un defaut
corrige sans test est un defaut qui reviendra.

LES FICHIERS SONT FABRIQUES ICI, PAS FIGES DANS LE DEPOT. Un .pptx de
reference serait une archive binaire de plusieurs centaines de kilo-octets
qu'aucun relecteur ne pourrait inspecter, et dont personne ne saurait, six
mois plus tard, ce qu'elle est censee contenir. Le construire par programme
rend le contenu attendu lisible dans le test lui-meme.
"""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

TYPE_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TYPE_PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

#: Les lecteurs refusent un texte de moins de 200 caracteres : chaque
#: paragraphe est donc assez long pour que le fichier soit exploitable.
GARNITURE = (
    "Ce paragraphe developpe la notion sur une longueur suffisante pour que "
    "le document soit considere comme exploitable par l'extraction. "
)


def construire_docx(avec_tableau: bool = True) -> bytes:
    import docx

    document = docx.Document()
    document.add_paragraph("Avant le tableau. " + GARNITURE)
    if avec_tableau:
        tableau = document.add_table(rows=2, cols=2)
        tableau.cell(0, 0).text = "Livrable"
        tableau.cell(0, 1).text = "Barème"
        tableau.cell(1, 0).text = "Rapport technique"
        tableau.cell(1, 1).text = "5 points"
    document.add_paragraph("Apres le tableau. " + GARNITURE)

    tampon = io.BytesIO()
    document.save(tampon)
    return tampon.getvalue()


def construire_pptx(notes: str = "", numero_de_page: bool = True) -> bytes:
    import pptx
    from pptx.util import Emu, Pt

    presentation = pptx.Presentation()
    diapo = presentation.slides.add_slide(presentation.slide_layouts[6])

    def cadre(texte: str, haut: int) -> None:
        forme = diapo.shapes.add_textbox(Emu(914400), Emu(haut), Emu(5486400), Emu(914400))
        forme.text_frame.text = texte
        forme.text_frame.paragraphs[0].font.size = Pt(18)

    # DELIBEREMENT dans le desordre : le corps est depose AVANT le titre, et le
    # numero de page avant les deux. L'ordre d'empilement est donc l'inverse de
    # l'ordre de lecture — c'est precisement ce que le tri par position corrige.
    if numero_de_page:
        cadre("7", 6000000)
    cadre("Le corps de la diapositive. " + GARNITURE, 2000000)
    cadre("Le titre de la diapositive", 500000)

    if notes:
        diapo.notes_slide.notes_text_frame.text = notes

    tampon = io.BytesIO()
    presentation.save(tampon)
    return tampon.getvalue()


def importer(client: TestClient, entetes: dict, nom: str, octets: bytes, type_mime: str):
    return client.post(
        "/api/courses/import",
        headers=entetes,
        files={"file": (nom, octets, type_mime)},
        data={"title": "Support importe"},
    )


class TestImportWord:
    def test_un_docx_est_accepte(self, client: TestClient, etudiant: dict) -> None:
        reponse = importer(client, etudiant, "cours.docx", construire_docx(), TYPE_DOCX)
        assert reponse.status_code == 201, reponse.text
        assert reponse.json()["course"]["charCount"] > 200

    def test_le_contenu_des_tableaux_est_extrait(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """
        DEFAUT EVITE : `document.paragraphs` ignore silencieusement tout ce qui
        vit dans un tableau. Sur Atelier 3.docx, cela represente 17 % du
        support — et dans un atelier, le tableau est la grille de notation.
        """
        reponse = importer(client, etudiant, "cours.docx", construire_docx(), TYPE_DOCX)
        identifiant = reponse.json()["course"]["id"]
        contenu = client.get(f"/api/courses/{identifiant}", headers=etudiant).json()
        texte = contenu["course"]["content"]

        assert "Rapport technique" in texte
        assert "5 points" in texte

    def test_le_tableau_reste_a_sa_place_dans_le_document(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """Lire les paragraphes puis les tableaux perdrait cet ordre."""
        reponse = importer(client, etudiant, "cours.docx", construire_docx(), TYPE_DOCX)
        identifiant = reponse.json()["course"]["id"]
        texte = client.get(f"/api/courses/{identifiant}", headers=etudiant).json()[
            "course"
        ]["content"]

        assert texte.index("Avant le tableau") < texte.index("Livrable")
        assert texte.index("Livrable") < texte.index("Apres le tableau")


class TestImportPowerPoint:
    def test_un_pptx_est_accepte(self, client: TestClient, etudiant: dict) -> None:
        reponse = importer(client, etudiant, "cours.pptx", construire_pptx(), TYPE_PPTX)
        assert reponse.status_code == 201, reponse.text

    def test_les_formes_sont_remises_dans_l_ordre_de_lecture(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """
        DEFAUT EVITE : slide.shapes suit l'ordre d'empilement, pas l'ordre de
        lecture. Le fichier d'essai depose volontairement le corps avant le
        titre ; sans tri par position, le resume heriterait d'un cours ou
        chaque paragraphe precede son propre titre.
        """
        reponse = importer(client, etudiant, "cours.pptx", construire_pptx(), TYPE_PPTX)
        identifiant = reponse.json()["course"]["id"]
        texte = client.get(f"/api/courses/{identifiant}", headers=etudiant).json()[
            "course"
        ]["content"]

        assert texte.index("Le titre de la diapositive") < texte.index(
            "Le corps de la diapositive"
        )

    def test_le_numero_de_diapositive_n_est_pas_pris_pour_du_contenu(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """
        Sinon 54 chiffres orphelins s'inserent dans un cours de 54 diapos.

        L'assertion porte sur les LIGNES, et c'est delibere. La premiere
        version de ce test cherchait la sous-chaine "\\n7\\n" — elle passait
        aussi bien avec le filtre retire, parce que le numero de page se trouve
        en bas de la diapositive, donc trie en dernier, donc sans retour a la
        ligne apres lui. Un test vert qui ne protege rien est pire qu'un test
        absent : il donne confiance.
        """
        reponse = importer(client, etudiant, "cours.pptx", construire_pptx(), TYPE_PPTX)
        identifiant = reponse.json()["course"]["id"]
        texte = client.get(f"/api/courses/{identifiant}", headers=etudiant).json()[
            "course"
        ]["content"]

        assert "7" not in [ligne.strip() for ligne in texte.splitlines()]

    def test_les_notes_de_l_orateur_sont_incluses(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """
        DECISION DE FOND, pas un detail : sur un diaporama de cours les puces
        sont telegraphiques et l'explication vit dans les notes. 42 diapos sur
        50 en portent dans seance1-Introduction.pptx.
        """
        notes = "L'explication complete que l'enseignant donne a l'oral."
        reponse = importer(
            client, etudiant, "cours.pptx", construire_pptx(notes=notes), TYPE_PPTX
        )
        identifiant = reponse.json()["course"]["id"]
        texte = client.get(f"/api/courses/{identifiant}", headers=etudiant).json()[
            "course"
        ]["content"]

        assert notes in texte
        assert "[Notes de l'orateur]" in texte

    def test_le_numero_de_diapositive_est_conserve_comme_repere(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """C'est la seule reference que l'etudiant peut rouvrir chez lui."""
        reponse = importer(client, etudiant, "cours.pptx", construire_pptx(), TYPE_PPTX)
        identifiant = reponse.json()["course"]["id"]
        texte = client.get(f"/api/courses/{identifiant}", headers=etudiant).json()[
            "course"
        ]["content"]

        assert "--- Diapositive 1 ---" in texte


class TestImportTexteBrut:
    """
    `.txt` et `.md` : trois lignes de code, et un piege d'encodage.
    """

    def test_un_fichier_texte_est_accepte(self, client: TestClient, etudiant: dict) -> None:
        reponse = importer(
            client, etudiant, "notes.txt", (GARNITURE * 4).encode("utf-8"), "text/plain"
        )
        assert reponse.status_code == 201, reponse.text

    def test_le_markdown_garde_ses_marques(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """
        On ne convertit pas le Markdown : ses marques sont du texte que le
        modele lit tres bien, et les retirer couterait une dependance pour
        perdre la structure des titres.
        """
        source = "# Chapitre 3\n\n- premier point\n- second point\n\n" + GARNITURE * 3
        reponse = importer(client, etudiant, "cours.md", source.encode("utf-8"), "text/markdown")
        identifiant = reponse.json()["course"]["id"]
        texte = client.get(f"/api/courses/{identifiant}", headers=etudiant).json()["course"][
            "content"
        ]
        assert "# Chapitre 3" in texte
        assert "- premier point" in texte

    def test_un_fichier_windows_en_cp1252_est_lu(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """
        LE PIEGE. Un fichier produit sous Windows est souvent en cp1252. Le
        decoder en UTF-8 leve une exception sur le premier caractere accentue
        — donc, dans un cours francais, des la premiere ligne.
        """
        source = "Préemption et ordonnancement : règles à retenir. " + GARNITURE * 3
        reponse = importer(
            client, etudiant, "cours.txt", source.encode("cp1252"), "text/plain"
        )
        assert reponse.status_code == 201, reponse.text
        identifiant = reponse.json()["course"]["id"]
        texte = client.get(f"/api/courses/{identifiant}", headers=etudiant).json()["course"][
            "content"
        ]
        assert "Préemption" in texte
        assert "règles" in texte

    def test_un_fichier_utf8_avec_bom_perd_son_bom(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """Le Bloc-notes de Windows en ajoute un ; il ne doit pas finir dans le cours."""
        reponse = importer(
            client,
            etudiant,
            "cours.txt",
            ("Résumé du chapitre. " + GARNITURE * 3).encode("utf-8-sig"),
            "text/plain",
        )
        identifiant = reponse.json()["course"]["id"]
        texte = client.get(f"/api/courses/{identifiant}", headers=etudiant).json()["course"][
            "content"
        ]
        assert not texte.startswith("\ufeff")
        assert texte.startswith("Résumé")

    def test_un_texte_trop_court_est_refuse(
        self, client: TestClient, etudiant: dict
    ) -> None:
        reponse = importer(client, etudiant, "vide.txt", b"Trop court.", "text/plain")
        assert reponse.status_code == 400


class TestFormatsRefuses:
    def test_un_format_inconnu_est_refuse(self, client: TestClient, etudiant: dict) -> None:
        reponse = importer(client, etudiant, "cours.zip", b"PK\x03\x04", "application/zip")
        assert reponse.status_code == 400
        assert reponse.json()["error"]["code"] == "VALIDATION_ERROR"
        assert ".pptx" in reponse.json()["error"]["message"]

    @pytest.mark.parametrize(
        ("nom", "remede"), [("cours.doc", ".docx"), ("cours.ppt", ".pptx")]
    )
    def test_un_format_d_avant_2007_nomme_le_remede(
        self, client: TestClient, etudiant: dict, nom: str, remede: str
    ) -> None:
        """
        Aucune bibliotheque Python pure ne lit les formats binaires. Refuser
        est inevitable ; refuser SANS dire quoi faire ne l'est pas.
        """
        reponse = importer(client, etudiant, nom, b"\xd0\xcf\x11\xe0", "application/msword")
        assert reponse.status_code == 400
        assert remede in reponse.json()["error"]["message"]

    def test_un_docx_endommage_est_refuse_proprement(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """
        L'extension oriente le lecteur, le lecteur tranche. Un fichier
        renomme en .docx n'est pas un .docx, et doit produire une erreur du
        projet et non une trace d'exception.
        """
        reponse = importer(client, etudiant, "faux.docx", b"ceci n'est pas une archive", TYPE_DOCX)
        assert reponse.status_code == 400
        assert reponse.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_un_document_sans_texte_est_refuse(
        self, client: TestClient, etudiant: dict
    ) -> None:
        import docx

        document = docx.Document()
        document.add_paragraph("Trop court.")
        tampon = io.BytesIO()
        document.save(tampon)

        reponse = importer(client, etudiant, "vide.docx", tampon.getvalue(), TYPE_DOCX)
        assert reponse.status_code == 400
        assert "texte" in reponse.json()["error"]["message"].lower()

    def test_le_type_mime_du_navigateur_n_est_pas_decisif(
        self, client: TestClient, etudiant: dict
    ) -> None:
        """
        Windows annonce regulierement application/octet-stream pour un .pptx
        selon l'application qui l'a cree. Se fier au type MIME refuserait un
        fichier parfaitement valide.
        """
        reponse = importer(
            client, etudiant, "cours.pptx", construire_pptx(), "application/octet-stream"
        )
        assert reponse.status_code == 201, reponse.text

    def test_un_fichier_sans_extension_est_refuse(
        self, client: TestClient, etudiant: dict
    ) -> None:
        reponse = importer(client, etudiant, "cours", construire_docx(), TYPE_DOCX)
        assert reponse.status_code == 400


class TestImportEtAnonymisation:
    def test_un_support_importe_passe_par_le_masquage(
        self, client: TestClient, etudiant: dict, faux_modele
    ) -> None:
        """
        Le chemin d'import est nouveau ; la garantie de confidentialite, non.
        Ce test verifie que les deux se rencontrent : un courriel present dans
        un .pptx ne doit pas partir en clair.
        """
        import pptx
        from pptx.util import Emu

        presentation = pptx.Presentation()
        diapo = presentation.slides.add_slide(presentation.slide_layouts[6])
        forme = diapo.shapes.add_textbox(Emu(914400), Emu(914400), Emu(5486400), Emu(1828800))
        forme.text_frame.text = (
            "Support redige par le charge de cours, joignable a "
            "contact.prive@exemple.tn au +216 55 123 456. " + GARNITURE * 2
        )
        tampon = io.BytesIO()
        presentation.save(tampon)

        reponse = importer(client, etudiant, "cours.pptx", tampon.getvalue(), TYPE_PPTX)
        identifiant = reponse.json()["course"]["id"]

        client.post(
            f"/api/courses/{identifiant}/summary",
            headers=etudiant,
            json={"level": "standard"},
        )

        envoye = "\n".join(appel["user"] for appel in faux_modele.appels)
        assert "contact.prive@exemple.tn" not in envoye
        assert "55 123 456" not in envoye
        assert "[EMAIL_1]" in envoye
