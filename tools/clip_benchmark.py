"""
Y2K Reference Benchmark v1 — CLIP vs Manual Label

用法：
    python clip_benchmark.py reference-test-y2k-2026-08-31.json --concept "Y2K"

依賴：requests（pip install requests）

concept 建議固定測兩輪，不要一開始就加 metallic / flip phone / pink / cyber / CRT
等具體物件字——那是在教 CLIP 答案，會讓 benchmark 失去驗證「原始概念辨識能力」的意義：
    第一輪：--concept "Y2K"
    第二輪：--concept "Y2K aesthetic"

輸入：reference-test.js 的「匯出 JSON」原檔（不必先手動轉格式）。
      對應到 exportButton 的 payload 結構：
      {
        "input": ..., "reference_count": ...,
        "references": [
          {
            "id": ..., "provider": ..., "query_family": ...,
            "image_regular": ..., "image_small": ..., "photo_url": ...,
            "alt": ..., "manual_label": "good"|"gray"|"wrong"|null, ...
          }, ...
        ]
      }

只需要你把下面 CLIP_INTERFACE 區塊接上你本地的模型／推論服務，
其餘統計、排序、表格輸出都已經照你要的規格寫好，不用動。
"""

from __future__ import annotations

import os
import argparse
import json
import statistics
import sys
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse


# ======================================================================
# CLIP_INTERFACE — 已接上本地 CLIP service (http://127.0.0.1:8765/score)
# ======================================================================
CLIP_SERVICE_URL = os.getenv("YOYO_CLIP_SCORE_URL", os.getenv("YOYO_CLIP_SERVICE_URL", "http://127.0.0.1:8765").rstrip("/") + "/score")
CLIP_BATCH_SIZE = 20  # 一次送太多張怕單一 request timeout，分批送
CLIP_TIMEOUT_SECONDS = 60


def get_clip_similarity(image_url: str, concept_text: str) -> float:
    """
    單張版本，僅在 USE_BATCH = False 時使用（不建議 80 張跑這個，見下方 batch 版本）。
    """
    import requests

    resp = requests.post(
        CLIP_SERVICE_URL,
        json={"text": concept_text, "images": [{"id": "single", "image_url": image_url}]},
        timeout=CLIP_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    payload = resp.json()
    return float(payload["results"][0]["score"])


def get_clip_similarity_batch(
    image_urls: list[str], concept_text: str, ids: list[str] | None = None
) -> list[float | None]:
    """
    對接 http://127.0.0.1:8765/score 的批次介面：

        request:
        {
          "text": "Y2K aesthetic",
          "images": [{"id": "xxx", "image_url": "https://..."}, ...]
        }

        response（假設）:
        {
          "results": [{"id": "xxx", "score": 0.31, ...}, ...]
        }

    若你的服務回傳格式跟這裡假設的不同，只需要改這個函式裡「解析 response」的那幾行，
    上面 main() 的呼叫方式不用動。

    80 張會依 CLIP_BATCH_SIZE 分批送，避免單一 request 太大或 timeout；
    單張失敗（該筆結果缺失、或整批 request 失敗）都回傳 None，
    交給上層標記成 clip_error，不會讓整批中斷。
    """
    import requests

    ids = ids or [str(i) for i in range(len(image_urls))]
    score_by_id: dict[str, float | None] = {i: None for i in ids}

    for start in range(0, len(image_urls), CLIP_BATCH_SIZE):
        batch_ids = ids[start : start + CLIP_BATCH_SIZE]
        batch_urls = image_urls[start : start + CLIP_BATCH_SIZE]
        images_payload = [
            {"id": img_id, "image_url": url} for img_id, url in zip(batch_ids, batch_urls)
        ]

        try:
            resp = requests.post(
                CLIP_SERVICE_URL,
                json={"text": concept_text, "images": images_payload},
                timeout=CLIP_TIMEOUT_SECONDS,
            )
            resp.raise_for_status()
            results = resp.json().get("results", [])
            for item in results:
                item_id = str(item.get("id", ""))
                if item_id in score_by_id and "score" in item:
                    score_by_id[item_id] = float(item["score"])
        except Exception as exc:  # noqa: BLE001 — 整批失敗也要繼續跑下一批，不中斷全部
            print(
                f"  [clip_error] batch {start}-{start + len(batch_urls)} failed: {exc}",
                file=sys.stderr,
            )
            # 這批全部保持 None（= clip_error），繼續下一批

    return [score_by_id[i] for i in ids]


USE_BATCH = True
# ======================================================================


@dataclass
class ScoredItem:
    id: str
    manual_label: str | None
    query_family: str
    source_domain: str
    image_url: str
    alt: str
    clip_score: float | None
    clip_rank: int | None = None
    clip_percentile: float | None = None


def domain_of(url: str) -> str:
    try:
        return urlparse(url).netloc or "(unknown)"
    except Exception:  # noqa: BLE001
        return "(unknown)"


def load_export(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if "references" not in data:
        raise ValueError(
            "找不到 'references' 欄位 — 這份 JSON 看起來不是 reference-test 匯出的原始格式。"
        )
    return data


def score_all(data: dict, concept: str) -> list[ScoredItem]:
    refs = data["references"]
    items: list[ScoredItem] = []

    if USE_BATCH:
        urls = [r.get("image_regular") or r.get("image_small") or "" for r in refs]
        ids = [str(r.get("id", i)) for i, r in enumerate(refs)]
        scores = get_clip_similarity_batch(urls, concept, ids=ids)
    else:
        scores = []
        for r in refs:
            url = r.get("image_regular") or r.get("image_small") or ""
            try:
                scores.append(get_clip_similarity(url, concept))
            except Exception as exc:  # noqa: BLE001
                print(f"  [clip_error] {url}: {exc}", file=sys.stderr)
                scores.append(None)

    for r, score in zip(refs, scores):
        url = r.get("image_regular") or r.get("image_small") or ""
        items.append(
            ScoredItem(
                id=str(r.get("id", "")),
                manual_label=r.get("manual_label"),
                query_family=str(r.get("query_family", "")),
                # 新版 SerpApi export 已經帶 source_domain，優先用它，
                # 不要重算掉整理好的 domain；只有它是空字串時才退回自己 parse URL。
                source_domain=str(r.get("source_domain") or domain_of(r.get("photo_url") or url)),
                image_url=url,
                alt=str(r.get("alt", "")),
                clip_score=score,
            )
        )

    scored = [i for i in items if i.clip_score is not None]
    scored.sort(key=lambda i: i.clip_score, reverse=True)  # 高分在前
    n = len(scored)
    for rank, item in enumerate(scored, start=1):
        item.clip_rank = rank
        item.clip_percentile = round((1 - (rank - 1) / max(1, n - 1)) * 100, 1) if n > 1 else 100.0

    failed = [i for i in items if i.clip_score is None]
    return scored + failed  # 失敗的排在最後，rank/percentile 保持 None


def label_breakdown(items: list[ScoredItem]) -> dict[str, int]:
    counts = {"good": 0, "gray": 0, "wrong": 0, "unlabeled": 0, "clip_error": 0}
    for i in items:
        if i.clip_score is None:
            counts["clip_error"] += 1
            continue
        label = i.manual_label or "unlabeled"
        counts[label] = counts.get(label, 0) + 1
    return counts


def print_top_n_breakdown(scored: list[ScoredItem]) -> None:
    for n in (10, 20, 30):
        top = [i for i in scored if i.clip_rank is not None and i.clip_rank <= n]
        counts = label_breakdown(top)
        counts.pop("clip_error", None)
        print(f"Top {n}: good={counts['good']}  gray={counts['gray']}  "
              f"wrong={counts['wrong']}  unlabeled={counts['unlabeled']}")


def print_rank_stats(scored: list[ScoredItem]) -> None:
    ranked = [i for i in scored if i.clip_rank is not None]
    good_ranks = [i.clip_rank for i in ranked if i.manual_label == "good"]
    wrong_ranks = [i.clip_rank for i in ranked if i.manual_label == "wrong"]

    print()
    if good_ranks:
        print(f"good 平均 rank：{statistics.mean(good_ranks):.1f}"
              f"（n={len(good_ranks)}，最好 rank={min(good_ranks)}，最差 rank={max(good_ranks)}）")
    else:
        print("good 平均 rank：無資料（沒有標記為 good 的項目）")

    if wrong_ranks:
        print(f"wrong 平均 rank：{statistics.mean(wrong_ranks):.1f}"
              f"（n={len(wrong_ranks)}，最好 rank={min(wrong_ranks)}，最差 rank={max(wrong_ranks)}）")
    else:
        print("wrong 平均 rank：無資料（沒有標記為 wrong 的項目）")

    print()
    best_wrong = min(
        (i for i in ranked if i.manual_label == "wrong"),
        key=lambda i: i.clip_rank,
        default=None,
    )
    worst_good = max(
        (i for i in ranked if i.manual_label == "good"),
        key=lambda i: i.clip_rank,
        default=None,
    )
    if best_wrong:
        print(f"最高排名的 wrong：rank={best_wrong.clip_rank}  "
              f"score={best_wrong.clip_score:.4f}  id={best_wrong.id}  "
              f"family={best_wrong.query_family}  domain={best_wrong.source_domain}")
        print(f"  alt: {best_wrong.alt[:80]}")
    if worst_good:
        print(f"最低排名的 good：rank={worst_good.clip_rank}  "
              f"score={worst_good.clip_score:.4f}  id={worst_good.id}  "
              f"family={worst_good.query_family}  domain={worst_good.source_domain}")
        print(f"  alt: {worst_good.alt[:80]}")


def print_query_family_breakdown(scored: list[ScoredItem]) -> None:
    """
    各 query_family 的人工品質 + CLIP 平均 rank。
    用來分辨：family 本身抓得差，還是 family 裡有好圖但 CLIP 排不好。
    """
    families = sorted({i.query_family for i in scored if i.query_family})

    print()
    print(f"{'family':<14}{'good':>6}{'gray':>6}{'wrong':>7}{'unlabeled':>11}{'avg_clip_rank':>16}")
    for family in families:
        members = [i for i in scored if i.query_family == family]
        counts = label_breakdown(members)
        ranked = [i.clip_rank for i in members if i.clip_rank is not None]
        avg_rank = f"{statistics.mean(ranked):.1f}" if ranked else "n/a"
        print(
            f"{family:<14}{counts['good']:>6}{counts['gray']:>6}{counts['wrong']:>7}"
            f"{counts['unlabeled']:>11}{avg_rank:>16}"
        )


def export_full_table(scored: list[ScoredItem], out_path: Path) -> None:
    rows = [
        {
            "clip_rank": i.clip_rank,
            "clip_score": i.clip_score,
            "clip_percentile": i.clip_percentile,
            "manual_label": i.manual_label,
            "query_family": i.query_family,
            "source_domain": i.source_domain,
            "id": i.id,
            "image_url": i.image_url,
            "alt": i.alt,
        }
        for i in scored
    ]
    out_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n完整排序表已輸出：{out_path}")


def export_family_summary(scored: list[ScoredItem], out_path: Path) -> None:
    families = sorted({i.query_family for i in scored if i.query_family})
    rows = []
    for family in families:
        members = [i for i in scored if i.query_family == family]
        counts = label_breakdown(members)
        ranked = [i.clip_rank for i in members if i.clip_rank is not None]
        rows.append(
            {
                "query_family": family,
                "good": counts["good"],
                "gray": counts["gray"],
                "wrong": counts["wrong"],
                "unlabeled": counts["unlabeled"],
                "clip_error": counts["clip_error"],
                "avg_clip_rank": round(statistics.mean(ranked), 2) if ranked else None,
                "n": len(members),
            }
        )
    out_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"query_family 統計已輸出：{out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="CLIP vs manual label benchmark")
    parser.add_argument("export_json", type=Path, help="reference-test.js 匯出的 JSON 檔路徑")
    parser.add_argument("--concept", required=True, help="CLIP 比對用的概念文字，例如 'Y2K aesthetic'")
    parser.add_argument(
        "--out", type=Path, default=Path("clip_benchmark_result.json"),
        help="完整排序表輸出路徑（預設 clip_benchmark_result.json）",
    )
    parser.add_argument(
        "--family-out", type=Path, default=Path("clip_benchmark_family_summary.json"),
        help="query_family 統計輸出路徑（預設 clip_benchmark_family_summary.json）",
    )
    args = parser.parse_args()

    data = load_export(args.export_json)
    print(f"輸入：{data.get('input')}  reference_count={data.get('reference_count')}")
    print(f"CLIP concept：{args.concept}")
    print(f"人工標記統計（來源檔案自帶）：{data.get('manual_summary')}")
    print()

    scored = score_all(data, args.concept)

    n_ok = len([i for i in scored if i.clip_score is not None])
    n_err = len(scored) - n_ok
    print(f"CLIP 評分完成：成功 {n_ok} 張，失敗 {n_err} 張")
    print()

    print_top_n_breakdown(scored)
    print_rank_stats(scored)
    print_query_family_breakdown(scored)
    export_full_table(scored, args.out)
    export_family_summary(scored, args.family_out)


if __name__ == "__main__":
    main()
