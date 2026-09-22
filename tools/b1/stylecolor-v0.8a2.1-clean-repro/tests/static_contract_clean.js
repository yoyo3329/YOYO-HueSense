'use strict';
const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');const cfg=JSON.parse(fs.readFileSync(path.join(root,'config','stylecolor_v0_8a2_1_clean_repro.config.json'),'utf8'));const req=fs.readFileSync(path.join(root,'python','requirements_certified.txt'),'utf8');const run=fs.readFileSync(path.join(root,'node','run_clean_repro.js'),'utf8');const worker=fs.readFileSync(path.join(root,'python','a2_foundation_worker_clean.py'),'utf8');let n=0,ok=0;function c(x,s){n++;console.log((x?'PASS  ':'FAIL  ')+s);if(x)ok++}
c(cfg.visual_embedding.model==='ViT-B-32-quickgelu','explicit QuickGELU model definition');
c(cfg.visual_embedding.pretrained==='openai','OpenAI pretrained identifier preserved');
c(cfg.visual_embedding.quick_gelu_required===true,'QuickGELU required');
c(req.includes('torch==2.13.0')&&req.includes('torchvision==0.28.0'),'torch/torchvision exact pins');
c(req.includes('open-clip-torch==3.3.0'),'OpenCLIP exact pin');
c(run.includes('baseline_uncertified_a2_run'),'uncertified baseline lineage recorded');
c(run.includes('quickgelu_correction_disclosure'),'QuickGELU correction disclosed');
c(worker.includes('OPENCLIP_QUICKGELU_CERTIFICATION_FAIL'),'worker fails if QuickGELU absent');
c(worker.includes('OPENCLIP_WEIGHT_SHA_MISMATCH'),'worker fails if OpenCLIP weight hash differs');
c(cfg.policy.no_algorithm_tuning===true,'no algorithm tuning contract');
c(cfg.policy.no_style_graph===true&&cfg.policy.no_production_integration===true,'no Style Graph / production');
c(cfg.input_contract.require_byte_identical_source_when_available===true,'byte-identical A1 source requirement');
console.log(`\n${ok}/${n} clean repro static checks ${ok===n?'PASS':'FAIL'}`);process.exit(ok===n?0:1);
