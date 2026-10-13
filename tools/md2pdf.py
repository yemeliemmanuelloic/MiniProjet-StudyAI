"""
Conversion Markdown -> PDF pour les livrables du projet.

Chaine : markdown -> HTML mis en forme -> Chrome headless --print-to-pdf.
Chrome est utilise plutot qu'une bibliotheque Python parce qu'il rend
correctement les tableaux larges, les blocs de code et les caracteres
accentues, ce qui n'est pas acquis avec les alternatives pures Python.

Prerequis : python -m pip install -r tools/requirements.txt

Usage :
    python tools/md2pdf.py docs/00-fiche-cadrage.md [autres.md ...]
    python tools/md2pdf.py --out-dir docs/pdf docs/*.md
"""

import argparse
import pathlib
import shutil
import subprocess
import sys
import tempfile

import markdown

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

CSS = """
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }

body {
  font-family: "Segoe UI", -apple-system, Helvetica, Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: #1a1a1a;
  margin: 0;
}

h1 {
  font-size: 22pt;
  margin: 0 0 4pt;
  padding-bottom: 8pt;
  border-bottom: 2.5pt solid #c8102e;
  page-break-after: avoid;
}
h2 {
  font-size: 14pt;
  margin: 22pt 0 6pt;
  padding-bottom: 3pt;
  border-bottom: 0.5pt solid #d4d4d4;
  page-break-after: avoid;
}
h3 { font-size: 11.5pt; margin: 14pt 0 4pt; page-break-after: avoid; }
h2 + p, h3 + p { margin-top: 0; }

p, li { orphans: 2; widows: 2; }

table {
  border-collapse: collapse;
  width: 100%;
  margin: 10pt 0;
  font-size: 9pt;
  page-break-inside: avoid;
}
th, td {
  border: 0.5pt solid #ccc;
  padding: 4pt 6pt;
  text-align: left;
  vertical-align: top;
}
th { background: #f4f4f4; font-weight: 600; }

code {
  font-family: Consolas, "Courier New", monospace;
  font-size: 9pt;
  background: #f4f4f4;
  padding: 1pt 3pt;
  border-radius: 2pt;
}
pre {
  background: #f7f7f7;
  border: 0.5pt solid #e0e0e0;
  border-left: 2.5pt solid #c8102e;
  padding: 8pt 10pt;
  font-size: 8.5pt;
  line-height: 1.4;
  overflow-x: auto;
  white-space: pre-wrap;
  page-break-inside: avoid;
}
pre code { background: none; padding: 0; font-size: inherit; }

blockquote {
  margin: 10pt 0;
  padding: 6pt 12pt;
  border-left: 2.5pt solid #c8102e;
  background: #fafafa;
  color: #333;
}

hr { border: none; border-top: 0.5pt solid #ddd; margin: 18pt 0; }
a { color: #0b5cad; text-decoration: none; }
strong { font-weight: 600; }
"""

CSS += """
.mermaid { text-align: center; margin: 14pt 0; page-break-inside: avoid; }
.mermaid svg { max-width: 100%; height: auto; }
"""

# Mermaid est charge depuis un CDN : les diagrammes du cahier des charges sont
# ecrits en Mermaid dans le Markdown et rendus en SVG au moment de l'impression.
HTML = """<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>{title}</title>
<style>{css}</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
</head><body>{body}
<script>
  if (window.mermaid) {{
    mermaid.initialize({{ startOnLoad: true, theme: 'neutral',
      themeVariables: {{ fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: '13px' }} }});
  }}
</script>
</body></html>"""


def inline_mermaid(html: str) -> str:
    """Transforme les blocs ```mermaid en conteneurs que mermaid.js rendra."""
    import html as html_mod
    import re

    def replace(match: "re.Match[str]") -> str:
        return f'<div class="mermaid">{html_mod.unescape(match.group(1))}</div>'

    return re.sub(
        r'<pre><code class="language-mermaid">(.*?)</code></pre>',
        replace,
        html,
        flags=re.DOTALL,
    )


def find_chrome() -> str:
    for path in CHROME_CANDIDATES:
        if pathlib.Path(path).exists():
            return path
    found = shutil.which("chrome") or shutil.which("msedge")
    if found:
        return found
    sys.exit("Chrome ou Edge introuvable : impossible de produire le PDF.")


def convert(src: pathlib.Path, out_dir: pathlib.Path, chrome: str) -> pathlib.Path:
    body = markdown.markdown(
        src.read_text(encoding="utf-8"),
        extensions=["tables", "fenced_code", "toc", "sane_lists"],
    )
    html = HTML.format(title=src.stem, css=CSS, body=inline_mermaid(body))

    out_dir.mkdir(parents=True, exist_ok=True)
    pdf = out_dir / f"{src.stem}.pdf"

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = pathlib.Path(tmp)
        tmp_html = tmp_dir / "doc.html"
        tmp_html.write_text(html, encoding="utf-8")

        # Chrome ecrit le PDF puis, sur un document charge de diagrammes, tarde
        # parfois a rendre la main. Le depassement de delai n'est donc pas un
        # echec en soi : seule l'absence du fichier en est un.
        stderr = ""
        try:
            result = subprocess.run(
                [
                chrome,
                "--headless=new",
                "--disable-gpu",
                "--no-sandbox",
                # Indispensable : sans profil dedie, Chrome sort en code 0 sans
                # rien ecrire lorsqu'une autre instance tourne deja.
                f"--user-data-dir={tmp_dir / 'profile'}",
                "--no-pdf-header-footer",
                # Laisse le temps a mermaid.js de rendre les diagrammes.
                "--virtual-time-budget=15000",
                f"--print-to-pdf={pdf.resolve()}",
                    tmp_html.as_uri(),
                ],
                capture_output=True,
                text=True,
                timeout=180,
            )
            stderr = result.stderr
        except subprocess.TimeoutExpired:
            stderr = "Chrome n'a pas rendu la main dans le delai imparti."

    if not pdf.exists() or pdf.stat().st_size == 0:
        sys.exit(f"Echec de la conversion : {src}\n{stderr.strip()}")

    if not pdf.read_bytes().rstrip().endswith(b"%%EOF"):
        sys.exit(f"PDF tronque : {src}")

    return pdf


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("sources", nargs="+", type=pathlib.Path)
    parser.add_argument("--out-dir", type=pathlib.Path, default=pathlib.Path("docs/pdf"))
    args = parser.parse_args()

    chrome = find_chrome()
    for src in args.sources:
        pdf = convert(src, args.out_dir, chrome)
        print(f"{src}  ->  {pdf}  ({pdf.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    main()
