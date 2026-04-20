#!/usr/bin/env python3
"""
Seed the Users and Patients tables with test data for end-to-end testing.

Usage:
  # Against Cloud SQL (staging) — uses the Cloud SQL Python Connector
  ENV=staging python scripts/seed_test_data.py

  # Against local Postgres
  DATABASE_URL=postgresql://dermatlas:dermatlas@localhost:5432/dermatlas_dev \
    python scripts/seed_test_data.py

  # Dry-run — just print the SQL without executing
  python scripts/seed_test_data.py --dry-run

All test accounts use the password: TestPass123!
"""

from __future__ import annotations

import argparse
import os
import sys
from textwrap import dedent

import bcrypt


# ---------------------------------------------------------------------------
# Password hashing — matches server/app/core/auth.py
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


# ---------------------------------------------------------------------------
# Test data definitions
# ---------------------------------------------------------------------------

DEFAULT_PASSWORD = "TestPass123!"

# Networks — each represents a single hospital tenant. Users only see other
# users in the same network, validating multi-tenancy in dev.
NETWORKS = [
    {"name": "Rice General Hospital", "slug": "rice-general"},
    {"name": "Baylor Clinic", "slug": "baylor-clinic"},
]

# PCPs — physicians who log in and upload images. Each is assigned to a
# network by slug, and exactly one per network is the network admin.
PCPS = [
    {
        "email": "sarah.chen@hospital.org",
        "full_name": "Dr. Sarah Chen",
        "npi_number": "1234567890",
        "network_slug": "rice-general",
        "is_admin": True,
    },
    {
        "email": "james.patel@hospital.org",
        "full_name": "Dr. James Patel",
        "npi_number": "2345678901",
        "network_slug": "rice-general",
        "is_admin": False,
    },
    {
        "email": "maria.garcia@hospital.org",
        "full_name": "Dr. Maria Garcia",
        "npi_number": "3456789012",
        "network_slug": "baylor-clinic",
        "is_admin": True,
    },
    {
        "email": "robert.kim@hospital.org",
        "full_name": "Dr. Robert Kim",
        "npi_number": "4567890123",
        "network_slug": "baylor-clinic",
        "is_admin": False,
    },
]

# Patient users — patients who can log in (role=PATIENT). Network assignment
# follows their primary physician (when one exists in PATIENTS below); the
# remaining ones default to the first network.
PATIENT_USERS = [
    {"email": "alice.johnson@email.com", "full_name": "Alice Johnson", "network_slug": "rice-general"},
    {"email": "bob.williams@email.com", "full_name": "Bob Williams", "network_slug": "rice-general"},
    {"email": "carol.davis@email.com", "full_name": "Carol Davis", "network_slug": "rice-general"},
    {"email": "eva.thompson@email.com", "full_name": "Eva Thompson", "network_slug": "rice-general"},
]

# Patient records — linked to PCPs by email
# physician_email is used to look up the PCP's user_id after insertion
PATIENTS = [
    # Dr. Chen's patients (4 — tests multi-patient PCP)
    {
        "physician_email": "sarah.chen@hospital.org",
        "full_name": "Alice Johnson",
        "mrn_internal": "MRN-2024-001",
        "date_of_birth": "1985-03-15",
        "gender": "female",
    },
    {
        "physician_email": "sarah.chen@hospital.org",
        "full_name": "Bob Williams",
        "mrn_internal": "MRN-2024-002",
        "date_of_birth": "1972-08-22",
        "gender": "male",
    },
    {
        "physician_email": "sarah.chen@hospital.org",
        "full_name": "Carol Davis",
        "mrn_internal": "MRN-2024-003",
        "date_of_birth": "1990-11-07",
        "gender": "female",
    },
    {
        "physician_email": "sarah.chen@hospital.org",
        "full_name": "David Martinez",
        "mrn_internal": "MRN-2024-004",
        "date_of_birth": "1968-01-30",
        "gender": "male",
    },
    # Dr. Patel's patients (2 — tests moderate load)
    {
        "physician_email": "james.patel@hospital.org",
        "full_name": "Eva Thompson",
        "mrn_internal": "MRN-2024-005",
        "date_of_birth": "1995-06-18",
        "gender": "female",
    },
    {
        "physician_email": "james.patel@hospital.org",
        "full_name": "Frank Wilson",
        "mrn_internal": "MRN-2024-006",
        "date_of_birth": "1983-12-03",
        "gender": "male",
    },
    # Dr. Garcia's patient (1 — tests single-patient PCP)
    {
        "physician_email": "maria.garcia@hospital.org",
        "full_name": "Grace Lee",
        "mrn_internal": "MRN-2024-007",
        "date_of_birth": "2001-09-25",
        "gender": "female",
    },
    # Dr. Kim has 0 patients — tests empty-practice edge case
]


# ---------------------------------------------------------------------------
# SQL generation
# ---------------------------------------------------------------------------

def build_sql() -> str:
    """Build the full INSERT SQL with hashed passwords."""
    pw_hash = hash_password(DEFAULT_PASSWORD)

    lines: list[str] = []
    lines.append("-- DermAtlas test data seed")
    lines.append("-- All accounts use password: TestPass123!")
    lines.append("-- Generated by server/scripts/seed_test_data.py")
    lines.append("")

    # --- Networks ---
    lines.append("-- ============================================================")
    lines.append("-- Networks (one per hospital tenant)")
    lines.append("-- ============================================================")
    for net in NETWORKS:
        lines.append(dedent(f"""\
            INSERT INTO networks (name, slug, created_at)
            VALUES ('{net["name"]}', '{net["slug"]}', CURRENT_TIMESTAMP)
            ON CONFLICT (slug) DO NOTHING;"""))
    lines.append("")

    # --- Users: PCPs ---
    lines.append("-- ============================================================")
    lines.append("-- PCP users (each scoped to a network; one admin per network)")
    lines.append("-- ============================================================")
    for pcp in PCPS:
        is_admin_sql = "TRUE" if pcp["is_admin"] else "FALSE"
        lines.append(dedent(f"""\
            INSERT INTO users (email, password_hash, full_name, role, npi_number, network_id, is_admin)
            VALUES (
                '{pcp["email"]}', '{pw_hash}', '{pcp["full_name"]}', 'PCP', '{pcp["npi_number"]}',
                (SELECT network_id FROM networks WHERE slug = '{pcp["network_slug"]}'),
                {is_admin_sql}
            )
            ON CONFLICT (email) DO NOTHING;"""))
    lines.append("")

    # --- Users: Patients ---
    lines.append("-- ============================================================")
    lines.append("-- Patient users (can log in with role=PATIENT)")
    lines.append("-- ============================================================")
    for pu in PATIENT_USERS:
        lines.append(dedent(f"""\
            INSERT INTO users (email, password_hash, full_name, role, network_id, is_admin)
            VALUES (
                '{pu["email"]}', '{pw_hash}', '{pu["full_name"]}', 'PATIENT',
                (SELECT network_id FROM networks WHERE slug = '{pu["network_slug"]}'),
                FALSE
            )
            ON CONFLICT (email) DO NOTHING;"""))
    lines.append("")

    # --- Patient records ---
    lines.append("-- ============================================================")
    lines.append("-- Patient records (linked to PCPs)")
    lines.append("-- ============================================================")
    for pt in PATIENTS:
        lines.append(dedent(f"""\
            INSERT INTO patients (primary_physician_id, full_name, mrn_internal, date_of_birth, gender)
            VALUES (
                (SELECT user_id FROM users WHERE email = '{pt["physician_email"]}'),
                '{pt["full_name"]}',
                '{pt["mrn_internal"]}',
                '{pt["date_of_birth"]}',
                '{pt["gender"]}'
            )
            ON CONFLICT (mrn_internal) DO NOTHING;"""))
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Database connection helpers
# ---------------------------------------------------------------------------

def connect_direct(database_url: str):
    """Connect via a direct postgresql:// URL using pg8000."""
    import pg8000.dbapi

    # Parse the URL: postgresql://user:pass@host:port/dbname
    url = database_url
    for prefix in ("postgresql+asyncpg://", "postgresql://"):
        if url.startswith(prefix):
            url = url[len(prefix):]
            break

    userpass, hostdb = url.split("@", 1)
    user, password = userpass.split(":", 1) if ":" in userpass else (userpass, "")
    hostport, dbname = hostdb.split("/", 1)
    host, port = hostport.split(":", 1) if ":" in hostport else (hostport, "5432")

    return pg8000.dbapi.connect(
        user=user,
        password=password,
        host=host,
        port=int(port),
        database=dbname,
    )


def connect_cloud_sql():
    """Connect via the Cloud SQL Python Connector."""
    from google.cloud.sql.connector import Connector

    instance = os.environ.get("CLOUD_SQL_INSTANCE_CONNECTION_NAME", "")
    pg_user = os.environ.get("PGUSER", "")
    pg_pass = os.environ.get("PGPASSWORD", "")
    pg_db = os.environ.get("PGDATABASE", "")

    if not all([instance, pg_user, pg_pass, pg_db]):
        print("ERROR: Missing Cloud SQL env vars.", file=sys.stderr)
        print("  Need: CLOUD_SQL_INSTANCE_CONNECTION_NAME, PGUSER, PGPASSWORD, PGDATABASE", file=sys.stderr)
        sys.exit(1)

    connector = Connector()
    return connector.connect(
        instance,
        "pg8000",
        user=pg_user,
        password=pg_pass,
        db=pg_db,
    )


def get_connection():
    """Pick the right connection strategy based on env vars."""
    database_url = os.environ.get("DATABASE_URL", "")
    use_cloud_sql = os.environ.get("USE_CLOUD_SQL_CONNECTOR", "").lower() == "true"

    # Load .env files the same way the server does
    env_mode = os.environ.get("ENV", "development")
    for env_file in (f".env.{env_mode}", ".env"):
        if os.path.exists(env_file):
            with open(env_file) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, val = line.split("=", 1)
                    os.environ.setdefault(key.strip(), val.strip())

    # Re-read after loading .env
    if not database_url:
        database_url = os.environ.get("DATABASE_URL", "")
    if not use_cloud_sql:
        use_cloud_sql = os.environ.get("USE_CLOUD_SQL_CONNECTOR", "").lower() == "true"

    if use_cloud_sql:
        print(f"Connecting via Cloud SQL Connector...")
        print(f"  Instance: {os.environ.get('CLOUD_SQL_INSTANCE_CONNECTION_NAME', '?')}")
        print(f"  Database: {os.environ.get('PGDATABASE', '?')}")
        return connect_cloud_sql()

    if database_url:
        print(f"Connecting via direct URL...")
        return connect_direct(database_url)

    print("ERROR: No database connection configured.", file=sys.stderr)
    print("  Set DATABASE_URL or USE_CLOUD_SQL_CONNECTOR=true with Cloud SQL env vars.", file=sys.stderr)
    print("  Or use --dry-run to just print the SQL.", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Seed DermAtlas test data")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print SQL without executing",
    )
    args = parser.parse_args()

    sql = build_sql()

    if args.dry_run:
        print(sql)
        print()
        print_credentials()
        return

    conn = get_connection()
    try:
        cursor = conn.cursor()
        # Execute each statement individually
        for statement in sql.split(";"):
            statement = statement.strip()
            if statement and not statement.startswith("--"):
                cursor.execute(statement)
        conn.commit()
        print()
        print("Seed data inserted successfully!")
        print()
        print_credentials()
    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()


def print_credentials():
    """Print a table of test credentials for easy reference."""
    print("=" * 70)
    print("TEST CREDENTIALS  (password for all: TestPass123!)")
    print("=" * 70)
    print()
    print(f"{'Email':<35} {'Name':<22} {'Role':<10} {'Network':<14} {'Admin?':<6}")
    print(f"{'-'*35} {'-'*22} {'-'*10} {'-'*14} {'-'*6}")
    for pcp in PCPS:
        admin_mark = "Yes" if pcp["is_admin"] else "—"
        print(
            f"{pcp['email']:<35} {pcp['full_name']:<22} {'PCP':<10} "
            f"{pcp['network_slug']:<14} {admin_mark:<6}"
        )
    for pu in PATIENT_USERS:
        print(
            f"{pu['email']:<35} {pu['full_name']:<22} {'PATIENT':<10} "
            f"{pu['network_slug']:<14} {'—':<6}"
        )
    print()
    print("Patient Records:")
    print(f"  {'MRN':<16} {'DOB':<12} {'Gender':<8} {'Physician'}")
    print(f"  {'-'*16} {'-'*12} {'-'*8} {'-'*24}")
    for pt in PATIENTS:
        doc = pt["physician_email"].split("@")[0].replace(".", " ").title()
        print(f"  {pt['mrn_internal']:<16} {pt['date_of_birth']:<12} {pt['gender']:<8} {doc}")
    print()
    print("NOTE: The first run may partially insert. Re-run is safe (ON CONFLICT DO NOTHING).")
    print()
    print("Edge cases covered:")
    print("  - Dr. Kim has 0 patients     (empty practice)")
    print("  - Dr. Garcia has 1 patient   (minimal)")
    print("  - Dr. Chen has 4 patients    (multi-patient)")
    print("  - Patient users can log in but have role=PATIENT (access denied on PCP endpoints)")
    print("  - MRN-2024-004 has no matching user account (patient without login)")


if __name__ == "__main__":
    main()
