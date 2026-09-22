
'use strict';
const crypto=require('crypto');
function clone(x){return JSON.parse(JSON.stringify(x))}
function stable(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stable).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}'}
function hash(v){return crypto.createHash('sha256').update(stable(v)).digest('hex')}
function canon(stage,payload){const x=clone(payload);if(stage==='b2'&&x.metadata)delete x.metadata.source_file;if(stage==='sensitivity'&&x.metadata){delete x.metadata.source_b1_file;delete x.metadata.source_b2_file}if(stage==='b3a'&&x.metadata){delete x.metadata.source_b2_file;delete x.metadata.source_sensitivity_file}if(stage==='relation'&&x.metadata)delete x.metadata.source_file;return x}
function equal(stage,a,b){return hash(canon(stage,a))===hash(canon(stage,b))}
module.exports={stable,hash,canon,equal};
