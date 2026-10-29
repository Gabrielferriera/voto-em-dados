#!/usr/bin/env python3
"""Offline TSE 2026 log inspection; no network, no vote choices, no extrapolation.

Input: a manifest of ONE accepted log per PRIMARY section. Paths are relative to
--logs. See docs/manifest-logs-example.json and README.md for limits. The script
intentionally rejects contingency/nested archives and duplicate section entries;
those require separate reconciliation, not silent omission or double counting.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, time, timezone
import hashlib
import io
import json
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo
import zipfile

COMPLETED = "O voto do eleitor foi computado"
ENABLED = "Eleitor foi habilitado"
BRT = ZoneInfo("America/Sao_Paulo")


def log_bytes(raw):
    if not zipfile.is_zipfile(io.BytesIO(raw)):
        raise ValueError("not_zip_jez: use original 2026 -log.jez")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        logs = [x for x in archive.infolist() if x.filename.lower().endswith("logd.dat")]
        nested = [x for x in archive.namelist() if x.lower().endswith((".jez", ".zip", ".logjez"))]
        if len(logs) != 1 or nested:
            raise ValueError("multiple_or_nested_logs_require_manual_reconciliation")
        if logs[0].file_size > 50_000_000:
            raise ValueError("unusually_large_log_requires_manual_review")
        return archive.read(logs[0]).decode("latin1")


def inspect(entry, logs_dir, election_date, turn):
    ident = {k: str(entry[k]) for k in ("uf", "municipio", "zona", "secao")}
    out = {**ident, "file": entry["file"], "source_url": entry.get("source_url"),
           "status": "not_processed", "issues": [], "completed_events": None,
           "enabled_events": None, "completed_17_19_brt": None,
           "completed_hourly_brt": None, "bu_reconciliation": "not_checked"}
    issues = out["issues"]
    try:
        file = (logs_dir / entry["file"]).resolve()
        if not file.is_relative_to(logs_dir.resolve()):
            raise ValueError("file_outside_logs_directory")
        if entry.get("accepted_status") != "Totalizado" or not entry.get("primary_section"):
            raise ValueError("must_be_totalized_primary_section")
        host = urlparse(entry.get("source_url", "")).hostname
        if host != "resultados.tse.jus.br":
            raise ValueError("official_source_url_required")
        raw = file.read_bytes()
        out["sha256"] = hashlib.sha256(raw).hexdigest()
        if entry.get("sha256") and entry["sha256"] != out["sha256"]:
            raise ValueError("sha256_mismatch")
        text = log_bytes(raw)
        rows, malformed, seen_lines = [], 0, set()
        duplicate_lines = 0
        for line in text.splitlines():
            cols = [c.strip() for c in line.split("\t")]
            # A ZIP may contain preparation logs and BOTH election dates.
            if not cols or not cols[0].startswith(election_date.strftime("%d/%m/%Y")):
                continue
            if len(cols) < 6:
                malformed += 1
                continue
            try:
                stamp = datetime.strptime(cols[0], "%d/%m/%Y %H:%M:%S")
            except ValueError:
                malformed += 1
                continue
            if line in seen_lines:
                duplicate_lines += 1
            seen_lines.add(line)
            rows.append((stamp, cols[3], cols[4]))
        if not rows:
            issues.append("no_events_on_requested_date")
        if malformed:
            issues.append(f"malformed_lines:{malformed}")
        if duplicate_lines:
            issues.append(f"duplicate_lines:{duplicate_lines}")
        if not any(m == "Fase da UE: Oficial" for _, _, m in rows):
            issues.append("official_phase_not_observed")
        if not any(m == f"Turno da UE: {turn}º turno" for _, _, m in rows):
            issues.append("turn_marker_not_observed")
        if any(a == "ADH" or "ajuste de data" in m.lower() for _, a, m in rows):
            issues.append("clock_adjustment_event_requires_review")
        if any(b[0] < a[0] for a, b in zip(rows, rows[1:])):
            issues.append("non_monotonic_clock_requires_review")
        completed = [d for d, a, m in rows if a == "VOTA" and m == COMPLETED]
        enabled = [d for d, a, m in rows if a == "VOTA" and m == ENABLED]
        out["completed_events"] = len(completed)
        out["enabled_events"] = len(enabled)
        # These counts measure different events. An enabled session can be
        # interrupted; never substitute habilitation count for completed count.
        if len(enabled) != len(completed):
            issues.append("enabled_completed_differ_requires_review")
        out["clock_timezone"] = entry.get("clock_timezone")
        out["clock_timezone_evidence"] = entry.get("clock_timezone_evidence")
        if not entry.get("clock_timezone") or not entry.get("clock_timezone_evidence"):
            issues.append("clock_timezone_not_documented")
        else:
            local_zone = ZoneInfo(entry["clock_timezone"])
            stamps = [d.replace(tzinfo=local_zone).astimezone(BRT) for d in completed]
            if any(d.date() != election_date for d in stamps):
                issues.append("normalized_date_differs_requires_review")
            if not issues:
                out["completed_17_19_brt"] = sum(time(17) <= d.time() < time(19) for d in stamps)
                out["completed_hourly_brt"] = {str(h).zfill(2): sum(d.hour == h for d in stamps) for h in range(24)}
        expected = entry.get("expected_completed_from_bu")
        if expected is not None:
            out["expected_completed_from_bu"] = expected
            out["bu_reconciliation"] = "matched" if len(completed) == int(expected) else "mismatch"
            if out["bu_reconciliation"] == "mismatch":
                issues.append("bu_count_mismatch")
                out["completed_17_19_brt"] = None
                out["completed_hourly_brt"] = None
        out["status"] = "needs_review" if issues else "processed_preliminary"
        if not issues and out["bu_reconciliation"] == "matched":
            out["status"] = "processed_reconciled"
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as exc:
        out["status"] = "excluded"
        issues.append(str(exc))
    return out


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--manifest", type=Path, required=True)
    cli.add_argument("--logs", type=Path, required=True)
    cli.add_argument("--out", type=Path, required=True)
    args = cli.parse_args()
    manifest = json.loads(args.manifest.read_text())
    date = datetime.strptime(manifest["election_date"], "%Y-%m-%d").date()
    entries = manifest["sections"]
    keys = [(x["uf"], x["municipio"], x["zona"], x["secao"]) for x in entries]
    if len(keys) != len(set(keys)):
        cli.error("Duplicate primary section: reconcile hashes/contingency first")
    records = [inspect(e, args.logs, date, int(manifest["turn"])) for e in entries]
    groups = defaultdict(list)
    for r in records:
        groups[(r["uf"], r["municipio"])].append(r)
    aggregated = []
    for (uf, municipality), rows in sorted(groups.items()):
        valid = [r for r in rows if r["completed_17_19_brt"] is not None]
        scope = manifest.get("coverage_expected_primary_sections", {}).get(f"{uf}:{municipality}")
        aggregated.append({"uf": uf, "municipio": municipality,
            "manifest_primary_sections": len(rows), "processed_primary_sections": len(valid),
            "expected_primary_sections_in_geography": scope,
            "coverage_percent": round(len(valid) / scope * 100, 4) if scope else None,
            "completed_events_observed": sum(r["completed_events"] for r in valid),
            "completed_17_19_brt_observed": sum(r["completed_17_19_brt"] for r in valid) if valid else None,
            "reconciled_primary_sections": sum(r["status"] == "processed_reconciled" for r in valid),
            "scope": "ONLY_PROCESSED_LOGS_NOT_GEOGRAPHIC_TOTAL"})
    states = []
    for uf in sorted({r["uf"] for r in records}):
        rows = [r for r in records if r["uf"] == uf]
        valid = [r for r in rows if r["completed_17_19_brt"] is not None]
        scope = manifest.get("coverage_expected_primary_sections_by_uf", {}).get(uf)
        states.append({"uf": uf, "manifest_primary_sections": len(rows),
            "processed_primary_sections": len(valid), "expected_primary_sections_in_geography": scope,
            "coverage_percent": round(len(valid) / scope * 100, 4) if scope else None,
            "completed_events_observed": sum(r["completed_events"] for r in valid),
            "completed_17_19_brt_observed": sum(r["completed_17_19_brt"] for r in valid) if valid else None,
            "reconciled_primary_sections": sum(r["status"] == "processed_reconciled" for r in valid),
            "scope": "ONLY_PROCESSED_LOGS_NOT_GEOGRAPHIC_TOTAL"})
    result = {"generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "election_date": str(date), "turn": manifest["turn"],
        "interval_brt": "[17:00:00, 19:00:00)",
        "definition": "VOTA / O voto do eleitor foi computado: voter-session completion events, not candidate votes.",
        "limitations": ["Not a count of arrivals or queue members.",
            "No candidate attribution and no estimate of extension's causal effect.",
            "Partial coverage must not be extrapolated to municipality, UF or Brazil.",
            "SHA-256 is a reproducibility checksum; this script does not validate TSE digital signatures.",
            "Contingency/nested logs, clock adjustments and BU mismatches require reconciliation."],
        "sections": records, "municipalities": aggregated, "states": states}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(args.out), "sections": len(records),
                      "status": dict(Counter(r["status"] for r in records))}, ensure_ascii=False))

if __name__ == "__main__":
    main()
