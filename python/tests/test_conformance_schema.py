# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = ROOT / "conformance" / "schema"
RULES_DIR = ROOT / "conformance" / "rules"


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_schemas_are_valid_and_cases_conform() -> None:
    schemas = sorted(SCHEMA_DIR.glob("*.schema.json"))
    if not schemas:
        pytest.skip("no conformance schemas yet")
    for schema_path in schemas:
        Draft202012Validator.check_schema(_load(schema_path))

    case_schema_path = SCHEMA_DIR / "case.schema.json"
    cases = sorted(RULES_DIR.glob("*.json"))
    if not case_schema_path.exists() or not cases:
        pytest.skip("no case schema or case files yet")

    registry = Registry().with_resources(
        (doc["$id"], Resource.from_contents(doc, default_specification=DRAFT202012))
        for doc in (_load(p) for p in schemas)
        if "$id" in doc
    )
    validator = Draft202012Validator(_load(case_schema_path), registry=registry)
    failures = []
    for case in cases:
        for err in validator.iter_errors(_load(case)):
            failures.append(f"{case.name}: {err.json_path}: {err.message}")
    assert not failures, "\n".join(failures)


def test_regex_fixtures_conform_and_findings_resolve() -> None:
    schema = _load(SCHEMA_DIR / "regex-case.schema.json")
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    fixtures = sorted((ROOT / "conformance" / "regex").glob("*.json"))
    assert fixtures, "no regex fixtures"
    failures, case_ids = [], set()
    for path in fixtures:
        doc = _load(path)
        failures += [f"{path.name}: {e.json_path}: {e.message}" for e in validator.iter_errors(doc)]
        for case in doc["cases"]:
            assert case["id"] not in case_ids, f"duplicate case id {case['id']}"
            case_ids.add(case["id"])
    assert not failures, "\n".join(failures)
    findings = _load(ROOT / "docs" / "regex-findings.json")["findings"]
    referenced = {cid for f in findings for cid in f["cases"]}
    assert referenced <= case_ids, f"findings cite missing cases: {sorted(referenced - case_ids)}"
    assert case_ids <= referenced, f"cases in no finding: {sorted(case_ids - referenced)}"
