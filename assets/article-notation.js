
'use strict';
(async () => {
  for (const el of document.querySelectorAll('.latex-display')) {
    try { katex.render(el.textContent, el, {displayMode:true, throwOnError:true, output:'htmlAndMathml', trust:false}); }
    catch (error) { el.classList.add('notation-fallback'); console.error('Formula rendering failed', error); }
  }
  if (!document.querySelector('.mermaid')) return;
  try {
    mermaid.initialize({startOnLoad:false, securityLevel:'strict', theme:'base',
      fontFamily:'system-ui, -apple-system, "PingFang SC", sans-serif',
      themeVariables:{darkMode:true, background:'#181818', primaryColor:'#292929', primaryTextColor:'#e6e6e6', primaryBorderColor:'#777777', lineColor:'#aaaaaa', secondaryColor:'#353535', tertiaryColor:'#202020', fontSize:'14px'},
      flowchart:{htmlLabels:false, useMaxWidth:true, curve:'linear', nodeSpacing:24, rankSpacing:28}});
    await mermaid.run({querySelector:'.mermaid'});
  } catch(error) { console.error('Diagram rendering failed', error); }
})();
