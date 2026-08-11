#!/usr/bin/env python3
"""
Report-only reconciliation: live Stripe Checkout payments vs Supabase credits.

Does NOT grant or modify credits. Prints mismatches for manual review.

Run:
  STRIPE_SECRET_KEY=sk_live_... python3 scripts/reconcile-stripe-credits.py

Loads .env.local from the repo root when present (will not override existing env vars).
Requires a LIVE Stripe secret key (sk_live_…).
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from base64 import b64encode
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]

# Manual / comp credits — not Stripe fulfillment bugs.
KNOWN_NON_BUG_EMAILS = {
    "business.kc13@gmail.com",  # Comp tokens for Facebook horse photo permission
}
KNOWN_NON_BUG_USER_IDS = {
    "b3e37a5a-d6a1-4688-9222-cf5719f38105",  # business.kc13@gmail.com
}

PACK_ID_TO_BALANCE_COLUMN = {
    "single_view_no3d_1": "single_view_balance",
    "single_view_no3d_3": "single_view_balance",
    "single_view_no3d_5": "single_view_balance",
    "single_view_3d_1": "single_view_3d_balance",
    "single_view_3d_3": "single_view_3d_balance",
    "single_view_3d_5": "single_view_3d_balance",
    "full_report_no3d_1": "full_report_balance",
    "full_report_no3d_3": "full_report_balance",
    "full_report_no3d_5": "full_report_balance",
    "full_report_3d_1": "full_report_3d_balance",
    "full_report_3d_3": "full_report_3d_balance",
    "full_report_3d_5": "full_report_3d_balance",
    "sv-1": "single_view_balance",
    "sv-3": "single_view_balance",
    "sv-5": "single_view_balance",
    "sv3d-1": "single_view_3d_balance",
    "sv3d-3": "single_view_3d_balance",
    "sv3d-5": "single_view_3d_balance",
    "fv-1": "full_report_balance",
    "fv-3": "full_report_balance",
    "fv-5": "full_report_balance",
    "fv3d-1": "full_report_3d_balance",
    "fv3d-3": "full_report_3d_balance",
    "fv3d-5": "full_report_3d_balance",
}

# Mirror src/lib/stripe/rosette-packs.ts (id → credit count, name)
PACK_CREDITS = {
    "sv-1": (1, "Single View Full Report"),
    "sv-3": (3, "3 Single View Full Reports"),
    "sv-5": (5, "5 Single View Full Reports"),
    "sv3d-1": (1, "Single View Full Report + 3D"),
    "sv3d-3": (3, "3 Single View Full Reports + 3D"),
    "sv3d-5": (5, "5 Single View Full Reports + 3D"),
    "fv-1": (1, "Four-View Full Report"),
    "fv-3": (3, "3 Four-View Full Reports"),
    "fv-5": (5, "5 Four-View Full Reports"),
    "fv3d-1": (1, "Four-View Full Report + 3D"),
    "fv3d-3": (3, "3 Four-View Full Reports + 3D"),
    "fv3d-5": (5, "5 Four-View Full Reports + 3D"),
    "single_view_no3d_1": (1, "single_view_no3d_1"),
    "single_view_no3d_3": (3, "single_view_no3d_3"),
    "single_view_no3d_5": (5, "single_view_no3d_5"),
    "single_view_3d_1": (1, "single_view_3d_1"),
    "single_view_3d_3": (3, "single_view_3d_3"),
    "single_view_3d_5": (5, "single_view_3d_5"),
    "full_report_no3d_1": (1, "full_report_no3d_1"),
    "full_report_no3d_3": (3, "full_report_no3d_3"),
    "full_report_no3d_5": (5, "full_report_no3d_5"),
    "full_report_3d_1": (1, "full_report_3d_1"),
    "full_report_3d_3": (3, "full_report_3d_3"),
    "full_report_3d_5": (5, "full_report_3d_5"),
}

BALANCE_KEYS = (
    "single_view_balance",
    "single_view_3d_balance",
    "full_report_balance",
    "full_report_3d_balance",
)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    # Last occurrence wins within the file (supports rotated keys appended below old ones).
    parsed: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        parsed[key] = value

    for key, value in parsed.items():
        # Prefer file values over inherited shell env for this script, so a
        # freshly rotated key in .env.local is used even if the shell still
        # exports an older STRIPE_SECRET_KEY.
        os.environ[key] = value

    # If both a live and test key somehow remain, force the live one.
    live = parsed.get("STRIPE_SECRET_KEY", "")
    if "_live_" not in live:
        for key, value in parsed.items():
            if "STRIPE" in key.upper() and "SECRET" in key.upper() and "_live_" in value:
                os.environ["STRIPE_SECRET_KEY"] = value
                break


def empty_credits() -> dict[str, int]:
    return {k: 0 for k in BALANCE_KEYS}


def cents_display(cents: int | None) -> str:
    if cents is None:
        return "n/a"
    return f"${cents / 100:.2f}"


def credits_for_pack(pack_id: str) -> tuple[int, str]:
    if pack_id in PACK_CREDITS:
        return PACK_CREDITS[pack_id]
    match = re.search(r"(?:^|[_-])(\d+)$", pack_id)
    return (int(match.group(1)), pack_id) if match else (0, pack_id)


def parse_cart_items(metadata: dict[str, Any] | None) -> list[dict[str, Any]] | None:
    metadata = metadata or {}
    raw = (metadata.get("cartItems") or "").strip()
    if raw:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(parsed, list):
            return None
        items = []
        for value in parsed:
            if not isinstance(value, dict):
                continue
            pack_id = str(value.get("packId") or "").strip()
            qty = value.get("quantity", 1)
            if isinstance(qty, (int, float)) and qty == qty:
                quantity = int(qty)
            else:
                quantity = 1
            if pack_id and quantity > 0:
                items.append({"packId": pack_id, "quantity": quantity})
        return items or None

    pack_id = (metadata.get("packId") or "").strip()
    if pack_id:
        return [{"packId": pack_id, "quantity": 1}]
    return None


def expected_from_items(items: list[dict[str, Any]]) -> tuple[dict[str, int], list[str], list[str]] | None:
    credits = empty_credits()
    lines: list[str] = []
    pack_ids: list[str] = []
    for item in items:
        pack_id = item["packId"]
        column = PACK_ID_TO_BALANCE_COLUMN.get(pack_id)
        per_pack, name = credits_for_pack(pack_id)
        if not column or per_pack <= 0:
            return None
        total = per_pack * item["quantity"]
        credits[column] += total
        pack_ids.append(pack_id)
        lines.append(f"{pack_id} x{item['quantity']} → {column} +{total} ({name})")
    return credits, lines, pack_ids


def sum_credits(credits: dict[str, int]) -> int:
    return sum(credits.values())


def format_balances(balances: dict[str, int] | None) -> str:
    if balances is None:
        return "no user_tokens row"
    return (
        f"sv={balances['single_view_balance']} "
        f"sv3d={balances['single_view_3d_balance']} "
        f"fv={balances['full_report_balance']} "
        f"fv3d={balances['full_report_3d_balance']}"
    )


class StripeClient:
    def __init__(self, secret_key: str) -> None:
        self.auth = b64encode(f"{secret_key}:".encode()).decode()

    def get(self, path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
        query = urllib.parse.urlencode(params or {})
        url = f"https://api.stripe.com/v1/{path}"
        if query:
            url = f"{url}?{query}"
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Basic {self.auth}"},
        )
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)

    def list_paid_credit_sessions(self) -> list[dict[str, Any]]:
        sessions: list[dict[str, Any]] = []
        starting_after: str | None = None
        while True:
            params: dict[str, str] = {"limit": "100", "status": "complete"}
            if starting_after:
                params["starting_after"] = starting_after
            page = self.get("checkout/sessions", params)
            for session in page.get("data", []):
                if session.get("mode") != "payment":
                    continue
                if session.get("payment_status") != "paid":
                    continue
                meta = session.get("metadata") or {}
                if not meta.get("userId"):
                    continue
                if not (meta.get("cartItems") or meta.get("packId")):
                    continue
                sessions.append(session)
            data = page.get("data") or []
            if not page.get("has_more") or not data:
                break
            starting_after = data[-1]["id"]
        return sessions


class SupabaseClient:
    def __init__(self, url: str, service_key: str) -> None:
        self.url = url.rstrip("/")
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }

    def get(self, path: str, params: str) -> list[dict[str, Any]]:
        req = urllib.request.Request(
            f"{self.url}/rest/v1/{path}?{params}",
            headers=self.headers,
        )
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)


def main() -> int:
    load_env_file(ROOT / ".env.local")

    secret_key = (os.environ.get("STRIPE_SECRET_KEY") or "").strip()
    supabase_url = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    service_key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()

    if not secret_key or not supabase_url or not service_key:
        print(
            "Missing STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY",
            file=sys.stderr,
        )
        return 1

    if "_test_" in secret_key:
        print(
            "Refusing to run: STRIPE_SECRET_KEY is a test key. "
            "Use a live sk_live_… key to reconcile real payments.",
            file=sys.stderr,
        )
        return 1

    if "_live_" not in secret_key:
        print(
            "Refusing to run: STRIPE_SECRET_KEY does not look like a live key (expected sk_live_…).",
            file=sys.stderr,
        )
        return 1

    stripe = StripeClient(secret_key)
    supabase = SupabaseClient(supabase_url, service_key)

    print("Fetching live paid EquiForm checkout sessions from Stripe…")
    try:
        sessions = stripe.list_paid_credit_sessions()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"Stripe API error {exc.code}: {body[:500]}", file=sys.stderr)
        return 1

    print(f"Found {len(sessions)} paid credit checkout session(s).\n")

    user_ids = sorted(
        {
            (s.get("metadata") or {}).get("userId", "").strip()
            for s in sessions
            if (s.get("metadata") or {}).get("userId")
        }
    )

    balances_by_user: dict[str, dict[str, int]] = {}
    purchases_by_user: dict[str, list[dict[str, Any]]] = {}

    if user_ids:
        in_list = ",".join(user_ids)
        token_rows = supabase.get(
            "user_tokens",
            "select=user_id,single_view_balance,single_view_3d_balance,full_report_balance,full_report_3d_balance"
            f"&user_id=in.({in_list})",
        )
        for row in token_rows:
            balances_by_user[row["user_id"]] = {
                k: int(row.get(k) or 0) for k in BALANCE_KEYS
            }

        purchase_rows = supabase.get(
            "token_transactions",
            "select=id,user_id,amount,description,created_at"
            f"&type=eq.purchase&user_id=in.({in_list})&order=created_at.asc",
        )
        for row in purchase_rows:
            purchases_by_user.setdefault(row["user_id"], []).append(row)

    expected_by_user: dict[str, int] = {}
    reports: list[dict[str, Any]] = []

    for session in sessions:
        meta = session.get("metadata") or {}
        user_id = (meta.get("userId") or "").strip() or None
        email = (
            ((session.get("customer_details") or {}).get("email"))
            or session.get("customer_email")
        )
        items = parse_cart_items(meta)
        notes: list[str] = []
        expected = empty_credits()
        lines: list[str] = []
        pack_ids: list[str] = []
        status = "mismatch"

        if not items:
            status = "unparseable"
            notes.append("Could not parse cartItems/packId metadata")
        else:
            parsed = expected_from_items(items)
            if not parsed:
                status = "unparseable"
                notes.append("Unknown packId or zero credits in cart")
                pack_ids = [i["packId"] for i in items]
            else:
                expected, lines, pack_ids = parsed

        expected_total = sum_credits(expected)
        if user_id:
            expected_by_user[user_id] = expected_by_user.get(user_id, 0) + expected_total

        purchases = purchases_by_user.get(user_id or "", [])
        purchase_credits = sum(int(tx.get("amount") or 0) for tx in purchases)
        current = balances_by_user.get(user_id) if user_id else None

        if not user_id:
            status = "missing_user"
            notes.append("No metadata.userId on session")

        reports.append(
            {
                "sessionId": session["id"],
                "createdAt": datetime.fromtimestamp(
                    session["created"], tz=timezone.utc
                ).isoformat(),
                "customerEmail": email,
                "userId": user_id,
                "amountPaidCents": session.get("amount_total"),
                "amountPaidDisplay": cents_display(session.get("amount_total")),
                "packIds": pack_ids,
                "expectedCredits": expected,
                "expectedCreditsTotal": expected_total,
                "expectedLines": lines,
                "currentBalances": current,
                "purchaseCreditsGranted": purchase_credits,
                "purchaseTransactions": [
                    {
                        "amount": int(tx.get("amount") or 0),
                        "description": tx.get("description"),
                        "created_at": tx.get("created_at"),
                    }
                    for tx in purchases
                ],
                "status": status,
                "notes": notes,
            }
        )

    for report in reports:
        email_norm = (report.get("customerEmail") or "").strip().lower()
        user_id = report.get("userId") or ""
        if email_norm in KNOWN_NON_BUG_EMAILS or user_id in KNOWN_NON_BUG_USER_IDS:
            report["status"] = "known_non_bug"
            report["notes"] = [
                "Known non-bug: manual/comp credits (not a Stripe webhook failure)"
            ]
            continue
        if report["status"] in ("unparseable", "missing_user") or not report["userId"]:
            continue
        aggregate = expected_by_user.get(report["userId"], 0)
        granted = report["purchaseCreditsGranted"]
        if granted <= 0:
            report["status"] = "mismatch"
            report["notes"] = [
                "No type=purchase token_transactions for this user (webhook likely never fulfilled)"
            ]
        elif granted < aggregate:
            report["status"] = "mismatch"
            report["notes"] = [
                f"Purchase txs total {granted} credits < aggregate expected {aggregate} from all paid sessions"
            ]
        else:
            report["status"] = "possibly_fulfilled"
            report["notes"] = [
                "User has enough purchase-transaction credits in aggregate — verify manually (no session_id on txs)"
            ]

    mismatches = [r for r in reports if r["status"] == "mismatch"]
    possibly_ok = [r for r in reports if r["status"] == "possibly_fulfilled"]
    known_non_bug = [r for r in reports if r["status"] == "known_non_bug"]
    other = [r for r in reports if r["status"] in ("unparseable", "missing_user")]

    print("=" * 72)
    print("STRIPE ↔ SUPABASE CREDIT RECONCILIATION (REPORT ONLY)")
    print(f"Generated: {datetime.now(timezone.utc).isoformat()}")
    print(f"Paid credit sessions: {len(reports)}")
    print(f"Mismatches (likely unpaid credits): {len(mismatches)}")
    print(f"Possibly fulfilled (manual review): {len(possibly_ok)}")
    print(f"Known non-bug (excluded from mismatches): {len(known_non_bug)}")
    print(f"Unparseable / missing user: {len(other)}")
    print("=" * 72)

    def print_report(report: dict[str, Any]) -> None:
        print("\n---")
        print(f"Status:          {report['status']}")
        print(f"Session ID:      {report['sessionId']}")
        print(f"Created:         {report['createdAt']}")
        print(f"Customer email:  {report['customerEmail'] or '(none)'}")
        print(f"User ID:         {report['userId'] or '(none)'}")
        print(f"Amount paid:     {report['amountPaidDisplay']}")
        print(f"Pack IDs:        {', '.join(report['packIds']) or '(none)'}")
        print(f"Expected credits ({report['expectedCreditsTotal']} total):")
        if not report["expectedLines"]:
            print("  (none)")
        else:
            for line in report["expectedLines"]:
                print(f"  - {line}")
        print(f"Current balances: {format_balances(report['currentBalances'])}")
        print(
            f"Purchase txs granted (all-time for user): {report['purchaseCreditsGranted']}"
        )
        for tx in report["purchaseTransactions"]:
            print(
                f"  - {tx['created_at']} amount={tx['amount']} {tx['description'] or ''}"
            )
        for note in report["notes"]:
            print(f"Note: {note}")

    if mismatches:
        print("\n### MISMATCHES — review and manually credit ###")
        for report in mismatches:
            print_report(report)

    if possibly_ok:
        print("\n### POSSIBLY FULFILLED — spot-check ###")
        for report in possibly_ok:
            print_report(report)

    if known_non_bug:
        print("\n### KNOWN NON-BUG — skipped (not a webhook failure) ###")
        for report in known_non_bug:
            print_report(report)

    if other:
        print("\n### UNPARSEABLE / MISSING USER ###")
        for report in other:
            print_report(report)

    out_path = ROOT / "scripts" / "reconcile-stripe-credits-report.json"
    out_path.write_text(
        json.dumps(
            {
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "summary": {
                    "paidSessions": len(reports),
                    "mismatches": len(mismatches),
                    "possiblyFulfilled": len(possibly_ok),
                    "knownNonBug": len(known_non_bug),
                    "other": len(other),
                },
                "reports": reports,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"\nWrote JSON report: {out_path}")
    print("No credits were modified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
