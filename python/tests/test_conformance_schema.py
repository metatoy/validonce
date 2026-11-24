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


def _dialect_validator() -> Draft202012Validator:
    """The published dialect (2020-12 + x-validonce) with every schema resolvable offline."""
    from jsonschema_specifications import REGISTRY as SPECS

    docs = [_load(p) for p in sorted(SCHEMA_DIR.glob("*.schema.json"))]
    dialect = _load(ROOT / "schemas" / "validonce" / "dialect-v1.json")
    registry = SPECS.with_resources(
        (d["$id"], Resource.from_contents(d, default_specification=DRAFT202012))
        for d in [*docs, dialect]
    )
    return Draft202012Validator(dialect, registry=registry)


def test_golden_openapi_schemas_conform_to_the_dialect() -> None:
    """Every schema object in the golden OpenAPI documents is valid under the validonce dialect,
    including its x-validonce rules, and a broken rule anywhere in a schema is caught."""
    validator = _dialect_validator()
    golden = sorted((ROOT / "conformance" / "golden").glob("*.openapi.json"))
    assert golden, "no golden OpenAPI documents"
    checked = 0
    for path in golden:
        for name, schema in _load(path)["components"]["schemas"].items():
            errors = [
                f"{path.name} {name}: {e.json_path}: {e.message}"
                for e in validator.iter_errors(schema)
            ]
            assert not errors, "\n".join(errors)
            checked += "x-validonce" in schema
    assert checked >= 2, "expected the golden documents to carry x-validonce rules"

    bad_rule = {"id": "x", "kind": "nope", "message": {"key": "k"}}
    broken = {"type": "object", "x-validonce": {"version": 1, "rules": [bad_rule]}}
    assert list(validator.iter_errors(broken)), "an unknown rule kind must fail"
    nested = {"type": "object", "properties": {"inner": broken}}
    assert list(validator.iter_errors(nested)), "x-validonce is checked in nested schemas too"


def test_rules_file_schema_accepts_extract_output() -> None:
    """The rules-file schema (validonce extract --format json, *.validonce.json) accepts the
    golden rules keyed by schema name, with an optional $schema, and rejects a broken rule."""
    docs = [_load(p) for p in sorted(SCHEMA_DIR.glob("*.schema.json"))]
    registry = Registry().with_resources(
        (d["$id"], Resource.from_contents(d, default_specification=DRAFT202012)) for d in docs
    )
    validator = Draft202012Validator(
        _load(SCHEMA_DIR / "rules-file-v1.schema.json"), registry=registry
    )
    schemas = _load(ROOT / "conformance" / "golden" / "aspnet.openapi.json")["components"][
        "schemas"
    ]
    extracted = {name: s["x-validonce"] for name, s in schemas.items() if "x-validonce" in s}
    assert extracted
    extracted["$schema"] = "https://schemas.metatoy.com/validonce/rules-file-v1.json"
    assert not list(validator.iter_errors(extracted))
    assert list(validator.iter_errors({"Signup": {"version": 1, "rules": [{"kind": "nope"}]}}))
