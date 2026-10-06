# YOYO_PACKAGE_V1

每個執行 ZIP 根目錄必須有 `yoyo_package.json`。

必要欄位：
- schema
- package_id
- package_version
- phase
- stage
- mode: DEV | FORMAL
- run_mode: SMOKE | MINI | REGRESSION | FULL | UTILITY
- formal_claim_allowed
- required_dataset
- required_upstream
- entrypoint
- install_plan
- expected_outputs
- success_gate
- timeout_seconds
- mainline_effect: STAGE_GATE | TEST_ONLY | NONE

## 重要
`mainline_effect=STAGE_GATE` 只有在：
- Gate PASS
- run_mode = FULL
時才會推進 Mainline。

FORMAL：
- requires_manual_formal_confirmation=true
- Control Center 不會因 ZIP 出現在 Inbox 就直接執行。


## Run Result Contract — summary.json V2

所有新的研究 Package 執行後，`summary.json` 應直接包含：

```json
{
  "purpose": "為什麼做這一步？",
  "process": ["實際執行步驟 1", "實際執行步驟 2"],
  "actions": ["runner / script / dataset / config"],
  "result_summary": "成功什麼、失敗什麼、Gate 是什麼",
  "improvements": ["本次發現或下一版要改進什麼"],
  "next_goal": {
    "stage": "P1_REBASE_DEV",
    "objective": "下一個 Stage 的目的",
    "pass_conditions": ["條件 1", "條件 2"]
  }
}
```

Control Center 會把同一份資料同時用於：
- App Result View
- `progress_journal.json`
- `<run_id>_RESULT.html`
- `<run_id>_RESULT.pdf`

舊格式 `what / why / input / result / difference / next` 仍可匯入，但只作相容層。
