import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTool} from '../../supabase/functions/_shared/science-tools.js';
import {recipe} from '../../frontend/science/recipes.js';
import {advancedDefaults} from '../../frontend/science/advanced-recipes.js';
import {csv,notebook} from '../../frontend/science/notebook.js';
test('all advanced recipes have validated examples and explicit result tables',()=>{
 for(const [kind,params]of Object.entries(advancedDefaults)){const tool=validateTool({kind,params});const code=recipe(kind,tool.params);assert.match(code,/result_rows/);assert(code.length<16000);}
});
test('rejects invalid physical inputs and filename/code injection',()=>{
 assert.throws(()=>validateTool({kind:'decay',params:{...advancedDefaults.decay,altitude:100}}));
 assert.throws(()=>validateTool({kind:'transit',params:{...advancedDefaults.transit,duration:10}}));
 assert.throws(()=>validateTool({kind:'budget',params:{...advancedDefaults.budget,burns:'3,NaN'}}));
 assert.throws(()=>validateTool({kind:'budget',params:{...advancedDefaults.budget,dry:20000}}));
 assert.throws(()=>validateTool({kind:'hrdiagram',params:{filename:'../../secret.csv'}}));
});
test('CSV exports preserve columns, quoting and protect string formula cells',()=>{
 const result=csv([{name:'=HYPERLINK("bad")',value:-1},{name:'Alpha, Beta',value:null}]);
 assert.match(result,/"'=HYPERLINK\(""bad""\)"/);assert.match(result,/"-1"/);assert.match(result,/"Alpha, Beta",""/);
});
test('notebooks retain executed code, outputs and plots and explicitly exclude uploads',()=>{
 const n=notebook({code:'print(42)',output:'42\n',images:['aGVsbG8=']});assert.equal(n.nbformat,4);assert.equal(n.cells[1].source[0],'print(42)');assert.equal(n.cells[1].outputs[0].text[0],'42\n');assert.equal(n.cells[1].outputs[1].data['image/png'],'aGVsbG8=');assert.match(n.cells[0].source.join(''),/not included/);
});
