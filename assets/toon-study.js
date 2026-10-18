'use strict';
(() => {
 const canvas=document.querySelector('#toon-ramp');
 if(!canvas)return;
 const ctx=canvas.getContext('2d');
 if(!ctx)return;
 const slider=document.querySelector('#toon-light'),output=document.querySelector('#toon-angle');
 const toLinear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
 const toSRGB=x=>x<=.0031308?x*12.92:1.055*x**(1/2.4)-.055;
 const lit=[.9,.77,.61].map(toLinear),shadow=[.43,.35,.41].map(toLinear);
 const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 function draw(){
  const angle=Number(slider.value)*Math.PI/180;output.value=slider.value+'°';
  const l=[Math.sin(angle),.25,Math.cos(angle)],len=Math.hypot(...l);for(let i=0;i<3;i++)l[i]/=len;
  ctx.fillStyle='#191919';ctx.fillRect(0,0,900,330);
  const size=212,radius=102;
  for(let mode=0;mode<3;mode++){
   const data=ctx.createImageData(size,size);
   for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const nx=(x-size/2+.5)/radius,ny=-(y-size/2+.5)/radius,r=nx*nx+ny*ny;
    if(r>1)continue;
    const nz=Math.sqrt(1-r),s=nx*l[0]+ny*l[1]+nz*l[2];
    const weight=mode===0?Math.max(0,s):mode===1?(s>.05?1:0):smooth(-.01,.11,s);
    const offset=(y*size+x)*4;
    for(let c=0;c<3;c++)data.data[offset+c]=Math.round(toSRGB(shadow[c]*(1-weight)+lit[c]*weight)*255);
    data.data[offset+3]=Math.round(Math.min(1,(1-Math.sqrt(r))*radius)*255);
   }
   const cx=160+290*mode;
   ctx.putImageData(data,cx-size/2,33);
   ctx.textAlign='center';ctx.fillStyle='#e4e4e4';ctx.font='25px system-ui';
   ctx.fillText(['连续响应','硬阈值','带过渡分层'][mode],cx,280);
   ctx.fillStyle='#a0a0a0';ctx.font='16px monospace';ctx.fillText(['CONTINUOUS','HARD STEP','SOFT BAND'][mode],cx,310);
  }
 }
 slider.addEventListener('input',draw);draw();
 const progress=document.createElement('div');progress.className='reading-progress';progress.setAttribute('aria-hidden','true');document.body.append(progress);
 function update(){const h=document.documentElement.scrollHeight-innerHeight;progress.style.width=(h>0?Math.min(100,scrollY/h*100):0)+'%';}
 addEventListener('scroll',update,{passive:true});addEventListener('resize',update);update();
})();
