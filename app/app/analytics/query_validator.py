"""Hard SQL validator.

Enforces, before any SQL reaches DuckDB:
- single statement only (no stacked queries)
- SELECT / WITH (top-level) only; no INSERT/UPDATE/DELETE/DDL/PRAGMA/COPY/etc.
- only approved analytics tables/views referenced
- no filesystem/network/extension functions (read_csv, read_parquet, INSTALL, LOAD, ...)
- row limit injected (LIMIT max_rows) when absent
Returns safe SQL text or raises ValidationError. The SQL is never executed on failure.
"""

from __future__ import annotations

import re
from typing import cast

import sqlglot
from pydantic import BaseModel
from sqlglot import exp


class ValidationError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class ValidatorLimits(BaseModel):
    max_rows: int
    max_bytes: int
    max_time_ms: int


APPROVED_OBJECTS: set[str] = {
    "transactions",
    "accounts",
    "categories",
    "budget_performance",
    "transactions_visible",
    "transaction_components",
    "transactions_included_in_totals",
}

APPROVED_SCHEMAS: set[str] = {"analytics"}

_DANGEROUS_PATTERNS: list[tuple[str, str]] = [
    (r"\bread_csv\b", "read_csv"),
    (r"\bread_parquet\b", "read_parquet"),
    (r"\bread_json\b", "read_json"),
    (r"\bread_csv_auto\b", "read_csv_auto"),
    (r"\bglob\b", "glob"),
    (r"\bhttpfs\b", "httpfs"),
    (r"\binstall\b", "install"),
    (r"\bload\b", "load"),
    (r"\bcopy\b", "copy"),
    (r"\bpragma\b", "pragma"),
    (r"\battach\b", "attach"),
    (r"\bexport\b", "export"),
    (r"\bimport\b", "import"),
    (r"\bcall\b", "call"),
]

_FORBIDDEN_STATEMENTS = (
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Create,
    exp.Drop,
    exp.Alter,
    exp.Command,
    exp.Merge,
)


def approved_schema() -> dict[str, set[str]]:
    """Allowlist of approved objects (name -> allowed columns; empty set = any)."""
    return {name: set() for name in APPROVED_OBJECTS}


def _assert_single_statement(sql: str) -> exp.Expression:
    try:
        parsed = sqlglot.parse(sql, read="duckdb")
    except Exception as exc:  # noqa: BLE001
        raise ValidationError(f"could not parse SQL: {exc}") from None
    statements: list[exp.Expression] = [
        cast(exp.Expression, s) for s in parsed if s is not None
    ]
    if len(statements) == 0:
        raise ValidationError("empty SQL")
    if len(statements) > 1:
        raise ValidationError("multiple statements are not allowed")
    return statements[0]


def _assert_read_only(parsed: exp.Expression) -> None:
    if isinstance(parsed, _FORBIDDEN_STATEMENTS):
        raise ValidationError(f"non-read-only statement rejected: {type(parsed).__name__}")
    # Top level must be a SELECT (possibly wrapped in WITH) or a UNION of selects.
    root = parsed
    if isinstance(root, exp.Subquery):
        root = root.this
    if not isinstance(root, (exp.Select, exp.Union, exp.With)):
        raise ValidationError("only SELECT / WITH queries are allowed")
    # No mutating nodes anywhere in the tree.
    for node in parsed.walk():
        if isinstance(node, _FORBIDDEN_STATEMENTS):
            raise ValidationError(
                f"non-read-only construct rejected: {type(node).__name__}"
            )


def _cte_names(parsed: exp.Expression) -> set[str]:
    names: set[str] = set()
    for cte in parsed.find_all(exp.CTE):
        alias = cte.alias_or_name
        if alias:
            names.add(alias.lower())
    return names


def _assert_approved_tables(parsed: exp.Expression, approved: dict[str, set[str]]) -> None:
    cte_names = _cte_names(parsed)
    for table in parsed.find_all(exp.Table):
        name = table.name.lower()
        schema = (table.db or "").lower()
        if name in cte_names and not schema:
            continue
        if schema and schema not in APPROVED_SCHEMAS:
            raise ValidationError(f"schema not approved: {schema}")
        if name not in approved:
            raise ValidationError(f"table not approved: {name}")


def _assert_no_dangerous_calls(sql: str) -> None:
    lowered = sql.lower()
    for pattern, label in _DANGEROUS_PATTERNS:
        if re.search(pattern, lowered):
            raise ValidationError(f"dangerous construct rejected: {label}")


def _inject_limit(parsed: exp.Expression, max_rows: int) -> str:
    root = parsed
    if isinstance(root, exp.With):
        inner = root.this
    else:
        inner = root
    if isinstance(inner, exp.Select):
        existing = inner.args.get("limit")
        if existing is None:
            inner.limit(max_rows, copy=False)
        else:
            try:
                current = int(existing.expression.name)
                if current > max_rows:
                    inner.limit(max_rows, copy=False)
            except (AttributeError, ValueError):
                inner.limit(max_rows, copy=False)
    return parsed.sql(dialect="duckdb")


def validate_sql(sql: str, limits: ValidatorLimits) -> str:
    if not sql or not sql.strip():
        raise ValidationError("empty SQL")
    _assert_no_dangerous_calls(sql)
    parsed = _assert_single_statement(sql)
    _assert_read_only(parsed)
    _assert_approved_tables(parsed, approved_schema())
    return _inject_limit(parsed, limits.max_rows)
