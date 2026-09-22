YOYO / HueSense — v0.8-A.1 Stable Atomic Regions + Relationship Diagnostics

這一版不是「把 317 Regions 合併少一點」。

它做的是：
- Atomic Regions 永久保留
- Multi-scale stability
- Perturbation stability
- Region purity / bimodality / foreground dilution signals
- Region adjacency relationship graph
- Boundary / color / texture / palette-impact evidence
- KEEP_SEPARATE_BUT_LINK 類關係
- 0 destructive merge
- CLIP status 明確區分 SCORED / NOT SELECTED / MODEL UNAVAILABLE / ERROR
- 不建立 Style Graph
- 不聲稱 real-world object truth
- 不把 heuristic score 說成 probability

安裝：
雙擊 INSTALL_AND_RUN_STYLECOLOR_v0.8A1.cmd

主要輸出：
run_manifest.json
atomic_region_observations.json
region_relationship_graph.json
physical_audit.json
extractor_summary.json
audit_report.json
audit.html

下一版 A.2 才考慮 foundation mask / semantic prior / visual embedding。
