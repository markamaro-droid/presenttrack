/* Topic-aware comparisons. Counts and speed are not treated as monotonic improvement. */
(() => {
  const dimensions=['objectives','coverage','clarity','relevance','examples','accuracy','organization'];
  const finite=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
  function metrics(result){const m=result?.metrics||{};return {wpm:finite(m.wpm),words:finite(m.words),duration:finite(m.totalDurationSec),fillers:finite(m.fillersPer100Words)??(m.words>0&&finite(m.fillerCount)!==null?finite(m.fillerCount/m.words*100):null),pauses:m.totalDurationSec>0&&finite(m.pauseCount)!==null?finite(m.pauseCount/(m.totalDurationSec/60)):null,delivery:finite(result?.deliveryScore??result?.score),explanation:result?.explanationQuality?.status==='completed'?finite(result.explanationQuality.score):null,...Object.fromEntries(dimensions.map(d=>[d,result?.explanationQuality?.status==='completed'?finite(result.explanationQuality.criteria?.[d]?.score):null]))};}
  const cost=(key,value)=>key==='wpm'?Math.max(100-value,0,value-160):['fillers','pauses'].includes(key)?value:-value;
  function trend(rows,key){const values=rows.map(r=>metrics(r)[key]).filter(n=>n!==null);if(values.length<3)return {label:values.length?'More sessions needed for a trend':'Not measured',count:values.length,average:values.length?values.reduce((a,b)=>a+b)/values.length:null};
    const half=Math.floor(values.length/2),a=values.slice(0,half),b=values.slice(-half),average=list=>list.reduce((x,y)=>x+y)/list.length;
    if(['words','duration','pauses'].includes(key))return {label:'Context dependent',count:values.length,average:average(values)};
    const delta=average(b.map(n=>cost(key,n)))-average(a.map(n=>cost(key,n))),tolerance=key==='wpm'?5:key==='delivery'||key==='explanation'?4:.3;
    return {label:Math.abs(delta)<=tolerance?'Stable':delta<0?'Improving':'Needs Attention',count:values.length,average:average(values)};
  }
  function describe(rows,key){const values=rows.map(r=>metrics(r)[key]).filter(n=>n!==null),recent=values.slice(-5);return {rollingAverage:recent.length?recent.reduce((a,b)=>a+b,0)/recent.length:null,best:!values.length||['words','duration','pauses'].includes(key)?null:values.reduce((a,b)=>cost(key,a)<=cost(key,b)?a:b)};}
  function compare(current,reference){const a=metrics(current),b=metrics(reference);return Object.fromEntries(Object.keys(a).map(key=>[key,a[key]===null||b[key]===null?null:a[key]-b[key]]));}
  globalThis.PTLearningMetrics={metrics,trend,describe,compare,dimensions};
})();
