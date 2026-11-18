#!/bin/bash
# One-click local setup: database → tables → demo data → dev server.
cd "$(dirname "$0")"
LOG="$(pwd)/setup.log"
exec > >(tee "$LOG") 2>&1
export PATH="/opt/homebrew/bin:/usr/local/bin:/opt/homebrew/opt/postgresql@16/bin:/usr/local/opt/postgresql@16/bin:$PATH"
step() { echo; echo "==== $1 ===="; }

db_up() { (echo > /dev/tcp/127.0.0.1/5432) >/dev/null 2>&1; }

step "1/5 Starting PostgreSQL"
if db_up; then
  echo "PostgreSQL is already running on port 5432."
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "Using Docker…"
  docker compose up -d postgres redis
else
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew not found — installing it."
    echo ">>> Type your Mac password below and press Enter (nothing shows while typing):"
    sudo -v || { echo "Password not accepted."; read -r -p "Press Enter to close"; exit 1; }
    ( while true; do sudo -n true; sleep 50; done ) 2>/dev/null &
    KEEP=$!
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    kill $KEEP 2>/dev/null
    eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv)"
  fi
  brew list postgresql@16 >/dev/null 2>&1 || brew install postgresql@16
  brew services start postgresql@16
fi

echo "Waiting for the database…"
for i in $(seq 1 30); do db_up && break; sleep 2; done
db_up || { echo "ERROR: PostgreSQL did not start."; read -r -p "Press Enter to close"; exit 1; }

step "2/5 Creating database user and database (Homebrew only)"
if command -v psql >/dev/null 2>&1 && ! docker ps 2>/dev/null | grep -q postgres; then
  psql postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='postgres'" | grep -q 1 || psql postgres -c "CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'postgres';"
  psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname='ecommerce'" | grep -q 1 || createdb -O postgres ecommerce
fi
echo "OK"

step "3/5 Installing packages (if needed)"
[ -d node_modules/@prisma/client ] || npm install

step "4/5 Creating tables"
npx prisma migrate dev --name init || { echo "ERROR: migration failed"; read -r -p "Press Enter to close"; exit 1; }

step "5/5 Loading demo data"
npm run db:seed || { echo "ERROR: seed failed"; read -r -p "Press Enter to close"; exit 1; }

echo
echo "✅ Setup complete. Starting the site at http://localhost:3000 (admin: /admin)"
echo "SETUP_DONE" 
(sleep 8; open "http://localhost:3000") &
npm run dev
