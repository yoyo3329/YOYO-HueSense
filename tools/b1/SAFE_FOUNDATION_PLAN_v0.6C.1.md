# YOYO Safe Foundation v0.6C.1 — Calibration-Safe Cross-Style Guard

## Why this patch exists
A legacy raw file, `calibration_set_v0_human.json`, predates the explicit `hue_applicability` field. It contains low-chroma cases whose old `hue_relation` labels are not internally comparable to the newer ontology.

The active calibration source is **not** that legacy file. `gold_train_candidate_v0_4.json` already uses the newer fields and currently satisfies:

- `low_chroma -> hue_relation = not_applicable`
- `reliable -> hue_relation != not_applicable`
- `review -> hue_relation = review`

The v0.5.2 holdout also satisfies the same schema.

## Safety decision
Do **not** rewrite historical human data in place. That would destroy provenance.

Instead v0.6C.1:
1. freezes `calibration_set_v0_human.json` as `HISTORICAL_ONLY`;
2. audits and quarantines legacy low-chroma review candidates;
3. validates the active train and holdout against a new Perceptual Label Contract;
4. requires this guard to pass before the cross-style registry is built;
5. keeps the structural cross-style registry free of subjective labels;
6. forbids numeric chroma values from auto-relabeling a human answer.

## Important distinction
`cross-style-dataset-contract-v0_1.js` is a **structural registry contract** and deliberately forbids subjective labels. It is not the human calibration schema.

The new companion contract is:
`perceptual-label-contract-v0_2.js`

Future cross-style calibration exports must use that contract.
