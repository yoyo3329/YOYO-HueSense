'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
function arg(n,d=null){const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:d}
function read(p){return JSON.parse(fs.readFileSync(p,'utf8'))}
function write(p,x){fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n')}
function sha(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
function stamp(){return new Date().toISOString().replace(/[-:]/g,'').replace(/\..+/,'').replace('T','_')}
function main(){
  const root=path.resolve(arg('--root', process.env.YOYO_B1_ROOT || path.resolve(__dirname,'..','..')));
  const a22=path.resolve(arg('--a22-run'));
  const py=arg('--python');
  const penv=path.resolve(arg('--postprocess-env'));
  const target=path.resolve(__dirname,'..');
  const cfg=path.join(target,'config','stylecolor_v0_8a2_2_1.config.json');
  if(!fs.existsSync(path.join(a22,'run_manifest.json')))throw new Error('A2.2 run_manifest missing');
  const a22m=read(path.join(a22,'run_manifest.json'));
  if(a22m.version!=='0.8a2.2')throw new Error('Upstream must be v0.8-A.2.2');
  const a21=arg('--a21-run',a22m.upstream_a21_run);
  if(!a21)throw new Error('A2.1 upstream path missing in A2.2 manifest');
  const outBase=path.join(root,'stylecolor-v0.8a2.2.1','runs');
  fs.mkdirSync(outBase,{recursive:true});
  const run=path.join(outBase,`${stamp()}_y2k_v0_8a2_2_1`);
  fs.mkdirSync(run,{recursive:true});
  const args=[path.join(target,'python','evidence_integrity_a221.py'),'--a22-run',a22,'--a21-run',a21,'--out-dir',run,'--config',cfg,'--postprocess-env',penv];
  const cp=spawnSync(py,args,{stdio:'inherit',encoding:'utf8',timeout:1800000});
  if(cp.status!==0)process.exit(cp.status||2);
  const s=read(path.join(run,'evidence_integrity_summary.json'));
  const g=read(path.join(run,'go_no_go.json'));
  const man={
    schema_version:'0.8a2.2.1',
    name:'YOYO v0.8-A.2.2.1 Evidence Provenance & Authority Hotfix',
    version:'0.8a2.2.1',
    created_at:new Date().toISOString(),
    upstream_a22_run:a22,
    upstream_a22_manifest_sha256:sha(path.join(a22,'run_manifest.json')),
    upstream_a21_run:a21,
    upstream_a21_manifest_sha256:sha(path.join(a21,'run_manifest.json')),
    model_inference:'NONE_POSTPROCESS_ONLY',
    foundation_masks_preserved:true,
    foundation_masks_deleted:0,
    roles_are_overlapping_evidence_not_truth:true,
    role_authority_matrix_applied:true,
    scene_background_and_ambiguous_local_authority_guard:true,
    semantic_prompt_top_label_authority:'NONE',
    embedding_neighbor_grouping_authority:'NONE',
    style_graph_built:false,
    production_authority:'NONE',
    evidence_environment_status:s.environment_provenance.evidence_environment_status,
    evidence_layer_go_no_go:g.decision,
    evidence_layer_validated:g.decision==='A2_EVIDENCE_LAYER_VALIDATED',
    perceptual_grouping_validated:false,
    summary:{
      images:s.images.length,
      masks:s.unique_mask_count,
      role_hypothesis_counts:s.role_hypothesis_counts,
      multi_role_mask_count:s.multi_role_mask_count,
      scene_or_background_blocked_from_local_recovery:s.scene_or_background_blocked_from_local_recovery,
      background_plane_newly_blocked_from_local_recovery:s.background_plane_newly_blocked_from_local_recovery,
      ambiguous_newly_blocked_from_local_recovery:s.ambiguous_newly_blocked_from_local_recovery,
      go_no_go_checks_passed:g.passed,
      go_no_go_checks_total:g.total,
      hold_reasons:g.hold_reasons
    }
  };
  write(path.join(run,'run_manifest.json'),man);
  const b=spawnSync(process.execPath,[path.join(target,'node','build_a221_audit.js'),run],{stdio:'inherit',encoding:'utf8'});
  if(b.status!==0)process.exit(b.status||3);
  fs.writeFileSync(path.join(outBase,'LATEST_RUN.txt'),run+'\n');
  console.log('RUN_DIR='+run);
}
main();
