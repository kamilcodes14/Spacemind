import {load,run} from './harness.mjs';
if(!process.argv[2])throw Error('Usage: node benchmarks/retrieval/run.mjs DATASET.json');
console.log(JSON.stringify(await run(await load(process.argv[2])),null,2));
