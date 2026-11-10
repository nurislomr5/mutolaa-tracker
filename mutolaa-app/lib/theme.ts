// layout.tsx <head> ichida birinchi boʻlib ishlaydi: saqlangan yoki tizim rejimini sahifa chizilishidan oldin qoʻllaydi
export const themeInitScript = `(function(){var t;try{t=localStorage.getItem('theme')}catch(e){}if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t})();`;

// Bosh sahifa: kirgan foydalanuvchiga mehmonlar uchun tanishtiruv (.guest-only) bir lahzaga ham koʻrinmasligi uchun.
// Bu faqat birinchi chizilish uchun taxmin (sessiya cookie'si bormi) — yakuniy qarorni server beradi (app/page.tsx).
export const authHintScript = `(function(){try{if(/(^|; )sb-[^=]+-auth-token(\\.\\d+)?=/.test(document.cookie))document.documentElement.dataset.auth='1'}catch(e){}})();`;
