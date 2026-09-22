#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');const U=require('./v0_7_common.js');
if(fs.existsSync(path.join(__dirname,'v0_7_train_queue.json'))&&fs.existsSync(path.join(__dirname,'v0_7_validation_commitment.json'))&&!process.argv.includes('--reset')){console.log('Fresh v0.7 case split already prepared; preserving sealed validation commitment.');process.exit(0)}
if(process.argv.includes('--reset')&&(fs.existsSync(path.join(__dirname,'v0_7_train_human.json'))||fs.existsSync(path.join(__dirname,'v0_7_candidate_freeze.json')))){throw new Error('Reset forbidden after human train labels or candidate freeze.')}
const graph=U.read('y2k_color_relation_graph.json');const prior=U.priorPairUniverse();
const pool=(graph.edges||[]).filter(e=>!prior.has(e.pair_key));
if(pool.length<100)throw new Error('Fresh pair pool unexpectedly small.');
const train=U.spaceFillSelect(pool,24,'YOYO-v0.7-TRAIN-SPACEFILL-v1',3);
if(train.selected.length!==24)throw new Error(`Could only select ${train.selected.length}/24 train cases`);
const trainKeys=new Set(train.selected.map(x=>x.e.pair_key));
const valPool=pool.filter(e=>!trainKeys.has(e.pair_key));
const validationSeed=crypto.randomBytes(32).toString('hex');
const val=U.spaceFillSelect(valPool,12,validationSeed,2);
if(val.selected.length!==12)throw new Error(`Could only select ${val.selected.length}/12 validation cases`);
const tq=train.selected.map((r,i)=>U.publicCase(`V07_TRAIN_${String(i+1).padStart(3,'0')}`,r.e));
const vq=val.selected.map((r,i)=>U.publicCase(`V07_VALID_${String(i+1).padStart(3,'0')}`,r.e));
const overlap=tq.filter(x=>new Set(vq.map(y=>y.pair_key)).has(x.pair_key));if(overlap.length)throw new Error('train/validation overlap');
const queue={metadata:{name:'YOYO v0.7 Fresh Train Queue',version:'0.7.0',role:'TRAIN_CALIBRATION',status:'UNLABELED',case_count:tq.length,selection:'SPACE_FILLING_OBJECTIVE_FEATURES',prior_labeled_pairs_excluded:prior.size,algorithm_outputs_hidden_in_lab:true,retired_holdout_used_for_selection:false},cases:tq};U.write('v0_7_train_queue.json',queue);
const secret=crypto.randomBytes(32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',secret,iv);const plain=Buffer.from(JSON.stringify({metadata:{name:'YOYO v0.7 Sealed Independent Validation Queue',version:'0.7.0',role:'INDEPENDENT_VALIDATION',case_count:vq.length,selected_before_train_labels:true},cases:vq}));const enc=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag();
fs.mkdirSync(path.join(__dirname,'_v0_7_sealed'),{recursive:true});fs.writeFileSync(path.join(__dirname,'_v0_7_sealed','validation_queue_v0_7.enc'),Buffer.concat([iv,tag,enc]));fs.writeFileSync(path.join(__dirname,'_v0_7_sealed','validation_key_v0_7.txt'),secret.toString('hex')+'\n');fs.writeFileSync(path.join(__dirname,'_v0_7_sealed','validation_selection_seed_v0_7.txt'),validationSeed+'\n');
const commit={metadata:{name:'YOYO v0.7 Independent Validation Commitment',version:'0.7.0',status:'SEALED_BEFORE_TRAIN_LABELS',case_count:12},cipher_sha256:U.fileSha(path.join('_v0_7_sealed','validation_queue_v0_7.enc')),pool_sha256:U.sha(valPool.map(e=>e.pair_key).sort().join('\n')),selection_algorithm:'SPACE_FILLING_OBJECTIVE_FEATURES_v1',selection_seed_commitment:U.sha(validationSeed),train_pair_digest:U.sha(tq.map(x=>x.pair_key).sort().join('\n')),validation_pair_digest:U.sha(vq.map(x=>x.pair_key).sort().join('\n')),note:'Validation case identities use a random local selection seed and are process-sealed until the v0.7 candidate is frozen. This prevents accidental pre-freeze exposure; it is not a hostile-user security boundary.'};U.write('v0_7_validation_commitment.json',commit);
const report={metadata:{name:'YOYO v0.7 Fresh Case Selection Report',version:'0.7.0',status:'PREPARED'},counts:{graph_pairs:graph.edge_count,prior_labeled_pairs:prior.size,fresh_pool:pool.length,train:24,validation_sealed:12,train_validation_overlap:0},selection:{objective_features:train.keys,max_train_mode_appearances:3,max_validation_mode_appearances:2,uses_retired_holdout_taxonomy:false,uses_v0_5_candidate_predictions:false},digests:{train_pairs:commit.train_pair_digest,validation_pairs:commit.validation_pair_digest,validation_cipher:commit.cipher_sha256}};U.write('v0_7_case_selection_report.json',report);console.log(`Fresh pool: ${pool.length}; Train: 24; Validation: 12 SEALED; overlap: 0.`);
