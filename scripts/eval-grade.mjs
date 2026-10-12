export function grade(answer,item){
 const text=answer.toLowerCase().replace(/,/g,'');
 if(item.numeric){const values=(text.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)||[]).map(Number);return values.some(n=>Math.abs(n-item.numeric.value)<=item.numeric.tolerance)&&text.includes(item.numeric.unit);}
 return item.required_terms.every(term=>text.includes(term));
}
