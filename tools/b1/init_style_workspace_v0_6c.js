#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const C=require('./style-workspace-contract-v0_1.js');
function slug(s){return String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64)}
const display=process.argv.slice(2).join(' ').trim();if(!display){console.error('Usage: node init_style_workspace_v0_6c.js "Quiet Luxury"');process.exit(1)}
const id=slug(display);if(!id){console.error('Cannot derive safe style id');process.exit(1)}
const dir=path.join(__dirname,'styles',id), manifest=path.join(dir,'style.workspace.json');
fs.mkdirSync(path.join(dir,'artifacts'),{recursive:true});
if(fs.existsSync(manifest)){console.log(`Workspace already exists: ${manifest}`);process.exit(0)}
const w={contract:{name:C.CONTRACT.name,version:C.CONTRACT.version},style:{id,display_name:display,concept_text:display},data_status:'DATA_PENDING',validation_scope:'UNVALIDATED_NEW_STYLE',paths:{evaluation_set:null,cache_dir:null,fallback_map:null,b1_observations_seed:null,artifact_dir:'artifacts'},baseline_compare:{enabled:false},authority:{mode:'OFFLINE_RND_ONLY',can_modify_live_runtime:false,can_promote_candidate_semantics:false}};
C.validate(w,{allowDataPending:true});fs.writeFileSync(manifest,JSON.stringify(w,null,2)+'\n','utf8');console.log(`Created DATA_PENDING workspace: ${manifest}`);
