// layout.tsx <head> ichida birinchi boʻlib ishlaydi: saqlangan yoki tizim rejimini sahifa chizilishidan oldin qoʻllaydi
export const themeInitScript = `(function(){var t;try{t=localStorage.getItem('theme')}catch(e){}if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t})();`;
