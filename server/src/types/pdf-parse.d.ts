/**
 * pdf-parse ne publie pas de types. Declaration minimale limitee a ce que le
 * projet utilise : l'extraction du texte d'un PDF a couche texte.
 */
declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: Record<string, unknown>;
  }

  function pdfParse(data: Buffer | Uint8Array): Promise<PdfParseResult>;

  export default pdfParse;
}
