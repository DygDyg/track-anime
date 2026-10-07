/** Query flag nginx/HTML bounce adds when sending browsers from legacy hosts to .win */
export const LEGACY_REDIRECT_PARAM = "legacy_redirect";

/** sessionStorage key set by early layout script / notice component */
export const LEGACY_REDIRECT_STORAGE_KEY = "ta:legacy-redirect";

export const LEGACY_REDIRECT_HOSTS = ["ta.dygdyg.ru", "track-anime.dygdyg.ru"] as const;

/**
 * Inline head script: capture ?legacy_redirect=1 into sessionStorage before React/SW.
 * Must stay free of external refs (stringified into layout).
 */
export const LEGACY_REDIRECT_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(LEGACY_REDIRECT_STORAGE_KEY)};var p=${JSON.stringify(LEGACY_REDIRECT_PARAM)};var u=new URL(location.href);if(u.searchParams.get(p)==="1"){sessionStorage.setItem(k,"1");u.searchParams.delete(p);var n=u.pathname+u.search+u.hash;history.replaceState(null,"",n||"/");}var r=document.referrer;if(!r)return;var h=new URL(r).hostname.toLowerCase();if(${JSON.stringify(LEGACY_REDIRECT_HOSTS)}.indexOf(h)>=0)sessionStorage.setItem(k,"1");}catch(e){}})();`;
