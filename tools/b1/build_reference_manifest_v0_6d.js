#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const D=require('./reference-discovery-contract-v0_1.js'),M=require('./reference-manifest-contract-v0_1.js');
function arg(n,f){const i=process.argv.indexOf(n);return i>=0&&process.argv[i+1]?process.argv[i+1]:f}
function fail(m){console.error('❌ '+m);process.exit(1)}
function readMaybe(p){return p&&fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null}
const input=path.resolve(arg('--input','reference_discovery_output.json')),
 out=path.resolve(arg('--output','reference_manifest_v0_6d.json')),
 styleId=arg('--style-id','unknown-style'),styleName=arg('--style-name',styleId),legacy=process.argv.includes('--legacy-import'),
 fallbackMapPath=arg('--fallback-map',null),fallbackMap=readMaybe(fallbackMapPath?path.resolve(fallbackMapPath):null)||{};
if(!fs.existsSync(input))fail('Input missing: '+input);
const d=JSON.parse(fs.readFileSync(input,'utf8'));D.validate(d,{allowLegacyImport:legacy});
const refs=d.references.map((r,i)=>{
 const imageUrl=r.image_regular||r.image_url;
 const variants=[{kind:'primary',cache_label:'primary',url:imageUrl,priority:1,skip:false}];
 const fb=fallbackMap[r.id];
 if(fb?.url)variants.push({kind:'fallback',cache_label:'google-fallback',url:fb.url,priority:2,skip:false,analysis_source:fb.analysisSource||'fallback',feature_reliability:fb.featureReliability??null});
 if(fb?.skipPrimary===true)variants[0].skip=true;
 return {reference_id:r.id,provider:r.provider,query_family:r.query_family,query:r.query||null,all_query_families:r.all_query_families||[r.query_family],image_url:imageUrl,analysis_url:r.analysis_url||null,source_page_url:r.photo_url||null,source_name:r.source_name||null,alt:r.alt||'',source_domain:r.source_domain||'unknown',provider_rank:Number.isFinite(r.provider_rank)?r.provider_rank:null,discovery_status:legacy?'LEGACY_SELECTED':'DISCOVERED',source_record_index:i,url_variants:variants};
});
const source={},fam={};for(const r of refs){source[r.source_domain]=(source[r.source_domain]||0)+1;fam[r.query_family]=(fam[r.query_family]||0)+1}
const m={contract:M.CONTRACT,style:{id:styleId,display_name:styleName,concept_text:d.input},metadata:{version:'0.6D',source_origin:legacy?'LEGACY_FIXED_EVALUATION_MIGRATION':'RAW_REFERENCE_DISCOVERY',role:'REFERENCE_ONLY',affects_display_search:false,created_at:new Date().toISOString(),selection_ready:legacy,selection_provenance:legacy?'LEGACY_FIXED_EVALUATION_SET':'RAW_REFERENCE_DISCOVERY_ONLY',reported_dead_url_count:Number.isFinite(d.dead_url_count)?d.dead_url_count:null,reported_dead_url_ratio:Number.isFinite(d.dead_url_ratio)?d.dead_url_ratio:null,fallback_map_applied:Object.keys(fallbackMap).length>0},references:refs,stats:{reference_count:refs.length,source_distribution:source,query_family_distribution:fam,query_family_count:Object.keys(fam).length,source_count:Object.keys(source).length}};
M.validate(m);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(m,null,2)+'\n');console.log(`Reference Manifest: ${refs.length} refs → ${out}`);
