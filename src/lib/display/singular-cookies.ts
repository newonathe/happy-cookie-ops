/**
 * The ported engine writes "N cookies" for every N, so a single cookie reads "1 cookies". Live mode corrects the
 * text after the fact (the engine is protected): only a bare "1" (not "11" or "21") is changed.
 */
export const singularCookies = (text: string): string =>
  text.replace(/(^|[^\d.])1 cookies\b/g, '$11 cookie');
